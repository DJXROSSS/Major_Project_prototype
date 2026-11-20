const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { pool } = require('../src/config/db');

test('subjects, authenticated preferences and paginated student API', async t => {
  const client = await pool.connect();
  const schema = `placepro_test_${process.pid}_${Date.now()}`;
  const originalQuery = pool.query.bind(pool);
  const originalConnect = pool.connect.bind(pool);
  let server;
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(fs.readFileSync(path.join(__dirname, '../sql/schema.updated.sql'), 'utf8'));
    // Reapplying the additive migration must be harmless.
    await client.query(fs.readFileSync(path.join(__dirname, '../sql/migrations/20261117_subject_columns.sql'), 'utf8'));
    await client.query(fs.readFileSync(path.join(__dirname, '../sql/migrations/20261121_batch_archive_metadata.sql'), 'utf8'));
    await client.query(fs.readFileSync(path.join(__dirname, '../sql/migrations/20261121_batch_archive_metadata.sql'), 'utf8'));
    pool.query = (...args) => client.query(...args);
    pool.connect = async () => ({ query: (...args) => client.query(...args), release() {} });
    await client.query(`INSERT INTO users (user_id,email,password_hash,full_name,role) VALUES
      (1,'admin@test.invalid','test','Admin','ADMIN'),(2,'trainer@test.invalid','test','Trainer','TRAINER'),(3,'student@test.invalid','test','Student','STUDENT'),(4,'other@test.invalid','test','Other','TRAINER')`);
    await client.query(`INSERT INTO academic_batches (academic_batch_id,name,department,academic_years,sections,trainer_ids) VALUES
      (1,'Batch','CSE','2024-2028','["A","B"]'::jsonb,'[2,999]'::jsonb),
      (2,'Other batch','CSE','2024-2028','["A"]'::jsonb,'[4,998]'::jsonb)`);
    await client.query(`INSERT INTO students (academic_batch_id,roll_no,full_name,email,batch,section,cgpa,average_score)
      SELECT 1, 'R' || n, 'Student ' || lpad(n::text,2,'0'), 's' || n || '@test.invalid', 'Batch', CASE WHEN n % 2 = 0 THEN 'A' ELSE 'B' END, 8, 75 FROM generate_series(1,23) n`);
    await client.query(`INSERT INTO students (academic_batch_id,roll_no,full_name,email,batch,section,cgpa,average_score)
      VALUES (2,'OTHER-1','Outside Student','outside@test.invalid','Other batch','A',7,60)`);
    const express = require('express');
    const app = express(); app.use(express.json());
    app.use('/api/v1', require('../src/services/admin/routes/admin.routes'));
    app.use('/api/v1', require('../src/services/students/routes/students.routes'));
    app.use(require('../src/middleware/error.middleware').errorHandler);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    async function request(url, user = 1, method = 'GET', body) {
      const token = jwt.sign({ userId: user }, process.env.JWT_SECRET || 'placepro-dev-secret');
      const response = await fetch(base + url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: response.status === 204 ? null : await response.json() };
    }
    let subject;
    await t.test('admin creates, validates and rejects duplicate subjects', async () => {
      const created = await request('/skills', 1, 'POST', { domain: 'Core Computer Science', name: 'Operating Systems', defaultVisible: true });
      assert.equal(created.status, 201); subject = created.body;
      assert.equal(subject.defaultVisible, true);
      assert.equal((await request('/skills', 1, 'POST', { domain: 'Core Computer Science', name: ' operating systems ' })).status, 409);
      assert.equal((await request('/skills', 1, 'POST', { domain: 'Core Computer Science', name: '  ' })).status, 400);
      assert.equal((await request('/skills', 1, 'POST', { domain: 'Core Computer Science', name: 'Custom', code: 'custom_code', defaultVisible: false })).status, 201);
      assert.equal((await request('/skills', 1, 'POST', { domain: 'Core Computer Science', name: 'Different', code: 'custom_code' })).status, 409);
      assert.equal((await request('/skills', 1, 'POST', { domain: 'Core Computer Science', name: 'Invalid', code: 'bad code' })).status, 400);
      assert.equal((await request(`/skills/${subject.id}`, 1, 'PATCH', { defaultVisible: 'false' })).status, 400);
      assert.equal((await request('/skills', 2, 'POST', { domain: 'Core Computer Science', name: 'Forbidden' })).status, 403);
      assert.equal((await request(`/skills/${subject.id}`, 3, 'PATCH', { active: false })).status, 403);
    });
    await t.test('preferences preserve custom choices and inherit new subjects only', async () => {
      assert.equal((await request('/me/subject-columns', 2)).body.columns, null);
      let saved = await request('/me/subject-columns', 2, 'PATCH', { columns: { [subject.id]: false } });
      assert.equal(saved.body.columns[subject.id], false);
      assert.equal((await request('/me/subject-columns', 4)).body.columns, null);
      await request(`/skills/${subject.id}`, 1, 'PATCH', { defaultVisible: false });
      await request(`/skills/${subject.id}`, 1, 'PATCH', { defaultVisible: true });
      const added = await request('/skills', 1, 'POST', { domain: 'Core Computer Science', name: 'New Subject', defaultVisible: true });
      let read = (await request('/me/subject-columns', 2)).body.columns;
      assert.equal(read[subject.id], false); assert.equal(read[added.body.id], true);
      await request(`/skills/${added.body.id}`, 1, 'PATCH', { defaultVisible: false });
      read = (await request('/me/subject-columns', 2)).body.columns;
      assert.equal(read[added.body.id], true);
      assert.equal((await request('/me/subject-columns', 2, 'PATCH', { columns: { unknown: true } })).status, 400);
      assert.equal((await request('/me/subject-columns', 3)).status, 403);
      assert.equal((await request('/me/subject-columns', 2, 'PATCH', { reset: true })).body.columns, null);
    });
    await t.test('editing/deactivation preserve score relationships and average', async () => {
      await client.query(`INSERT INTO import_batches (batch_id,academic_batch_id,event_type,event_title,original_filename,import_status) VALUES (1,1,'EXAM','Test','test.csv','CONFIRMED')`);
      await client.query(`INSERT INTO evaluation_records (record_id,batch_id,student_id) VALUES (1,1,1)`);
      await client.query(`INSERT INTO skill_ratings (student_id,skill_id,score_percentage,source_type,source_id) VALUES (1,$1,85,'EXAM',1)`, [subject.numericId]);
      const before = (await request('/students/1', 2)).body;
      const changed = await request(`/skills/${subject.id}`, 1, 'PATCH', { name: 'OS renamed', active: false, description: 'Changed', defaultVisible: false });
      assert.equal(changed.status, 200); assert.equal(changed.body.id, subject.id); assert.equal(changed.body.active, false);
      const after = (await request('/students/1', 2)).body;
      assert.deepEqual(after.scores, before.scores); assert.equal(after.average, before.average);
      assert.equal((await request('/skills', 2)).body.find(s => s.id === subject.id).active, false);
    });
    await t.test('stable pages, filtering, totals and invalid/out-of-range parameters', async () => {
      const first = (await request('/students?page=1&pageSize=10', 2)).body;
      const second = (await request('/students?page=2&pageSize=10', 2)).body;
      const last = (await request('/students?page=3&pageSize=10', 2)).body;
      assert.equal(first.total, 23); assert.equal(last.items.length, 3);
      assert.equal(new Set([...first.items, ...second.items, ...last.items].map(s => s.id)).size, 23);
      assert.deepEqual((await request('/students?page=2&pageSize=10', 2)).body.items.map(s => s.id), second.items.map(s => s.id));
      assert.equal((await request('/students?section=A&page=9', 2)).body.page, 2);
      assert.equal((await request('/students?section=A', 2)).body.total, 11);
      assert.equal((await request('/students?q=R23', 2)).body.total, 1);
      assert.equal((await request('/students?page=garbage&pageSize=NaN', 2)).body.page, 1);
      assert.equal((await request('/students?projectFilter=no-project', 2)).body.total, 23);
      assert.equal((await request('/students?projectFilter=has-project', 2)).body.total, 0);
      assert.equal((await request('/students?projectFilter=score-below-60', 2)).body.total, 0);
      assert.equal((await request('/students?sort=name_asc', 2)).body.items[0].name, 'Student 01');
      assert.equal((await request('/students/24', 2)).status, 404);
      assert.equal((await request('/students', 4)).body.total, 1);
      assert.equal((await request('/students', 3)).status, 403);
    });
    await t.test('user pagination preserves totals, filters and deterministic pages', async () => {
      await client.query(`INSERT INTO users (user_id,email,password_hash,full_name,role,created_at)
        SELECT n, 'bulk' || n || '@test.invalid', 'test', 'Bulk User ' || n, 'STUDENT', TIMESTAMPTZ '2030-01-01'
        FROM generate_series(10,34) n`);
      const first = (await request('/users?page=1&pageSize=10')).body;
      const second = (await request('/users?page=2&pageSize=10')).body;
      assert.equal(first.total, 29);
      assert.equal(first.items.length, 10);
      assert.equal(new Set([...first.items, ...second.items].map(user => user.id)).size, 20);
      assert.deepEqual(first.items.slice(0, 3).map(user => user.id), ['34', '33', '32']);
      const exact = (await request('/users?q=trainer%40test.invalid&page=1&pageSize=10')).body;
      assert.deepEqual(exact.items.map(user => user.id), ['2']);
      assert.equal((await request('/users?q=%40test.invalid&page=1&pageSize=10')).body.total, 29);
      assert.equal((await request('/users?role=trainer&page=1&pageSize=10')).body.total, 2);
      const empty = (await request('/users?page=99999&pageSize=10')).body;
      assert.equal(empty.total, 29); assert.deepEqual(empty.items, []);
      assert.equal((await request('/users?page=0')).status, 400);
      assert.equal((await request('/users?pageSize=1001')).status, 400);
      assert.equal((await request('/users?role=trainer&role=student')).status, 400);
    });
    await t.test('batch APIs resolve mixed trainer IDs, retain unresolved IDs and use complete counts', async () => {
      const listed = (await request('/batches')).body.find(batch => batch.id === '1');
      assert.deepEqual(listed.trainerIds, ['2', '999']);
      assert.deepEqual(listed.trainers.map(trainer => trainer.id), ['2']);
      assert.equal(listed.studentCount, 23);
      const stats = (await request('/batches/1/stats')).body;
      assert.equal(stats.studentCount, 23);
      assert.equal(stats.prCount + stats.nprCount, 23);
      assert.deepEqual(stats.sectionCounts, [{ section: 'A', count: 11 }, { section: 'B', count: 12 }]);
      assert.deepEqual((await request('/batches', 2)).body.map(batch => batch.id), ['1']);
      assert.equal((await request('/batches/2/stats', 2)).status, 404);
      const preserved = await request('/batches/1', 1, 'PATCH', { trainerIds: [2, 999] });
      assert.equal(preserved.status, 200, JSON.stringify(preserved.body));
      assert.deepEqual(preserved.body.trainerIds, ['2', '999']);
      assert.equal((await request('/batches/1', 1, 'PATCH', { trainerIds: [2, 3, 999] })).status, 400);
      assert.equal((await request('/batches', 1, 'POST', { name: 'Invalid', department: 'CSE', academicYears: '2025-2029', trainerIds: [3] })).status, 400);
    });
    await t.test('unresolved trainer assignments are corrected atomically without changing valid assignments', async () => {
      assert.equal((await request('/batches/1/trainer-assignments/resolve', 2, 'POST', { missingTrainerId: '999', action: 'remove' })).status, 403);
      assert.equal((await request('/batches/1/trainer-assignments/resolve', 1, 'POST', { missingTrainerId: '999', action: 'replace', replacementTrainerId: '2' })).status, 409);
      const replaced = await request('/batches/1/trainer-assignments/resolve', 1, 'POST', { missingTrainerId: '999', action: 'replace', replacementTrainerId: '4' });
      assert.equal(replaced.status, 200, JSON.stringify(replaced.body));
      assert.deepEqual(replaced.body.trainerIds, ['2', '4']);
      assert.deepEqual(replaced.body.trainers.map(trainer => trainer.id), ['2', '4']);
      assert.equal((await request('/batches/1/trainer-assignments/resolve', 1, 'POST', { missingTrainerId: '999', action: 'remove' })).status, 409);
      const removed = await request('/batches/2/trainer-assignments/resolve', 1, 'POST', { missingTrainerId: '998', action: 'remove' });
      assert.equal(removed.status, 200); assert.deepEqual(removed.body.trainerIds, ['4']);
      const audit = await client.query(`SELECT action FROM audit_logs WHERE module='Batches' AND action LIKE 'Replaced unresolved trainer assignment%'`);
      assert.equal(audit.rowCount, 1);
      assert.equal((await client.query(`SELECT 1 FROM audit_logs WHERE module='Batches' AND action LIKE 'Removed unresolved trainer assignment 998%'`)).rowCount, 1);
    });
    await t.test('batch sections validate, preserve order and protect referenced students', async () => {
      const custom = await request('/batches/1', 1, 'PATCH', { sections: [' A ', 'B', 'AA', 'Morning'] });
      assert.equal(custom.status, 200, JSON.stringify(custom.body));
      assert.deepEqual(custom.body.sections, ['A', 'B', 'AA', 'Morning']);
      assert.equal((await request('/batches/1', 1, 'PATCH', { sections: ['A', 'a'] })).status, 400);
      assert.equal((await request('/batches/1', 1, 'PATCH', { sections: ['A', ''] })).status, 400);
      const blocked = await request('/batches/1', 1, 'PATCH', { sections: ['A', 'AA', 'Morning'] });
      assert.equal(blocked.status, 409);
      assert.match(blocked.body.error.message, /Cannot delete Section B because 12 students are currently assigned/);
      assert.equal(blocked.body.error.details[0].section, 'B');
      assert.equal(blocked.body.error.details[0].batchId, '1');
      const labels = [];
      for (let n = 1; n <= 38; n += 1) {
        let value = n; let label = '';
        while (value > 0) { value -= 1; label = String.fromCharCode(65 + (value % 26)) + label; value = Math.floor(value / 26); }
        labels.push(label);
      }
      const expanded = await request('/batches/1', 1, 'PATCH', { sections: labels });
      assert.equal(expanded.status, 200, JSON.stringify(expanded.body));
      assert.equal(expanded.body.sections.length, 38);
      assert.equal(expanded.body.sections.at(-1), 'AL');
      assert.deepEqual((await request('/batches')).body.find(batch => batch.id === '1').sections, labels);
    });
    await t.test('trainer student management is batch-scoped, validated and audited', async () => {
      assert.equal((await request('/students/24', 2, 'PATCH', { section: 'A' })).status, 403);
      assert.equal((await request('/students/24/projects', 2)).status, 404);
      assert.equal((await request('/students', 2, 'POST', {
        name: 'Unauthorized', email: 'unauthorized@test.invalid', mobileNumber: '9876543210', rollNumber: 'U-1', academicBatchId: '2', section: 'A', cgpa: 8,
      })).status, 403);
      const changed = await request('/students/1', 2, 'PATCH', { name: 'Updated Student', email: 'updated@test.invalid', section: 'C', cgpa: 9 });
      assert.equal(changed.status, 200, JSON.stringify(changed.body));
      assert.equal(changed.body.section, 'C'); assert.equal(changed.body.cgpa, 9);
      assert.equal((await request('/students/1', 2, 'PATCH', { section: 'not-configured' })).status, 400);
      const unassigned = await request('/students/1/section', 2, 'DELETE');
      assert.equal(unassigned.status, 200); assert.equal(unassigned.body.section, '');
      const audit = await client.query(`SELECT action FROM audit_logs WHERE module='Students' ORDER BY log_id`);
      assert.equal(audit.rows.some(row => row.action.includes('Transferred student 1')), true);
      assert.equal(audit.rows.some(row => row.action.includes('Unassigned student 1')), true);
    });
    await t.test('populated batches archive and restore without changing linked data', async () => {
      const beforeStudents = await client.query(`SELECT student_id,academic_batch_id,section FROM students WHERE academic_batch_id=1 ORDER BY student_id`);
      const beforeBatch = (await client.query(`SELECT trainer_ids FROM academic_batches WHERE academic_batch_id=1`)).rows[0];
      const beforeAssessments = Number((await client.query(`SELECT COUNT(*) FROM import_batches WHERE academic_batch_id=1`)).rows[0].count);
      assert.equal((await request('/batches/1/archive', 2, 'POST')).status, 403);
      assert.equal((await request('/batches/1/archive', 3, 'POST')).status, 403);
      const archived = await request('/batches/1/archive', 1, 'POST');
      assert.equal(archived.status, 200, JSON.stringify(archived.body));
      assert.equal(archived.body.status, 'archived'); assert.equal(archived.body.archivedBy.id, '1'); assert.ok(archived.body.archivedAt);
      const archivedAgain = await request('/batches/1/archive', 1, 'POST');
      assert.equal(archivedAgain.status, 200); assert.equal(archivedAgain.body.archivedAt, archived.body.archivedAt);
      assert.equal((await request('/batches')).body.some(batch => batch.id === '1'), false);
      assert.equal((await request('/batches?status=archived')).body.some(batch => batch.id === '1'), true);
      assert.equal((await request('/batches/1/stats')).body.studentCount, 23);
      assert.equal((await request('/students/2', 2, 'PATCH', { section: 'C' })).status, 409);
      assert.equal((await request('/students', 1, 'POST', { name: 'Archived Add', email: 'archived-add@test.invalid', mobileNumber: '9876543210', rollNumber: 'ARCH-1', academicBatchId: '1', section: 'C', cgpa: 8 })).status, 400);
      assert.equal((await request('/batches/1', 1, 'DELETE')).status, 405);
      assert.deepEqual((await client.query(`SELECT student_id,academic_batch_id,section FROM students WHERE academic_batch_id=1 ORDER BY student_id`)).rows, beforeStudents.rows);
      assert.deepEqual((await client.query(`SELECT trainer_ids FROM academic_batches WHERE academic_batch_id=1`)).rows[0].trainer_ids, beforeBatch.trainer_ids);
      assert.equal(Number((await client.query(`SELECT COUNT(*) FROM import_batches WHERE academic_batch_id=1`)).rows[0].count), beforeAssessments);
      const restored = await request('/batches/1/restore', 1, 'POST');
      assert.equal(restored.status, 200); assert.equal(restored.body.status, 'active'); assert.equal(restored.body.archivedAt, null); assert.equal(restored.body.archivedBy, null);
      assert.equal((await request('/batches/1/restore', 1, 'POST')).status, 200);
      assert.equal((await request('/batches')).body.some(batch => batch.id === '1'), true);
      const audit = await client.query(`SELECT action FROM audit_logs WHERE module='Batches' AND (action LIKE 'Archived batch%' OR action LIKE 'Restored batch%') ORDER BY log_id`);
      assert.equal(audit.rowCount, 2);
    });
  } finally {
    t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await client.query('ROLLBACK');
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    client.release(); await pool.end();
    });
  }
});
