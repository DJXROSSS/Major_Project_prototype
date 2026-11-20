const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { pool } = require('../src/config/db');

test('company eligibility uses persisted, admin-controlled batch IDs', async t => {
  const client = await pool.connect();
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const schema = `company_batches_test_${process.pid}_${Date.now()}`;
  let server;
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    // Fresh-table definitions precede the legacy upgrade section (which contains pre-existing malformed DO delimiters).
    const baseSchema = fs.readFileSync(path.join(__dirname, '../sql/schema.updated.sql'), 'utf8').split('-- Migrate legacy enum-backed skills')[0];
    await client.query(baseSchema);
    await client.query(fs.readFileSync(path.join(__dirname, '../sql/migrations/20261121_batch_archive_metadata.sql'), 'utf8'));
    const migration = fs.readFileSync(path.join(__dirname, '../sql/migrations/20261119_company_eligible_batches.sql'), 'utf8');
    await client.query(migration);
    await client.query(migration);
    pool.query = (...args) => client.query(...args);
    pool.connect = async () => ({ query: (...args) => client.query(...args), release() {} });
    await client.query(`INSERT INTO users (user_id,email,password_hash,full_name,role) VALUES
      (1,'admin@test.invalid','unused','Admin','ADMIN'),(2,'trainer@test.invalid','unused','Trainer','TRAINER'),(3,'student@test.invalid','unused','Student','STUDENT')`);
    await client.query(`INSERT INTO academic_batches (academic_batch_id,name,department,academic_years) VALUES
      (1,'Outside','CSE','2023-2027'),(2,'Target','CSE','2024-2028'),(3,'Second target','CSE','2025-2029'),(4,'Empty target','CSE','2026-2030')`);
    await client.query(`INSERT INTO students (student_id,roll_no,full_name,email,academic_batch_id,batch,cgpa) VALUES
      (1,'A','Excellent outsider','a@test.invalid',1,'Target',9.9),
      (2,'B','Eligible target','b@test.invalid',2,'Old name',8),
      (3,'C','Low CGPA target','c@test.invalid',2,'Old name',6),
      (4,'D','Second batch','d@test.invalid',3,'Old name',8),
      (5,'E','Unassigned','e@test.invalid',NULL,'Target',9.9)`);
    await client.query(`INSERT INTO skill_taxonomy (skill_id,skill_code,skill_name,domain_id) SELECT 1,'dsa','DSA',MIN(domain_id) FROM evaluation_domains`);
    await client.query(`INSERT INTO import_batches (batch_id,event_type,event_title,original_filename,import_status) VALUES (1,'EXAM','Test','test.csv','CONFIRMED')`);
    await client.query(`INSERT INTO evaluation_records (record_id,batch_id,student_id) SELECT student_id,1,student_id FROM students`);
    await client.query(`INSERT INTO skill_ratings (student_id,skill_id,score_percentage,source_type,source_id)
      SELECT student_id,1,CASE WHEN student_id=4 THEN 40 ELSE 90 END,'EXAM',student_id FROM students`);
    const express = require('express');
    const app = express(); app.use(express.json());
    app.use('/api/v1', require('../src/services/companies/routes/companies.routes'));
    app.use(require('../src/middleware/error.middleware').errorHandler);
    const listen = async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); };
    await listen();
    async function request(url, role = 1, method = 'GET', body) {
      const token = jwt.sign({ userId: role }, process.env.JWT_SECRET || 'placepro-dev-secret');
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${url}`, {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: response.status === 204 ? null : await response.json() };
    }
    const profile = { name: 'Test company', role: 'Engineer', industry: 'IT', minCgpa: 7,
      eligibleBatchIds: ['2'], criteria: [{ skillId: 'dsa', minCutoff: 60, weightage: 1, mandatory: true }] };
    let id;
    const match = async (payload = {}) => request(`/companies/${id}/matches`, 2, 'POST', payload);
    await t.test('create, single batch, ID-based mismatch exclusion and eligibility', async () => {
      const created = await request('/companies', 1, 'POST', profile);
      assert.equal(created.status, 201, JSON.stringify(created.body)); id = created.body.id;
      assert.deepEqual(created.body.eligibleBatchIds, ['2']);
      const result = await match(); assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.total, 2);
      assert.deepEqual(result.body.items.map(r => r.student.id).sort(), ['2','3']);
      assert.equal(result.body.items.find(r => r.student.id === '2').eligible, true);
      assert.equal(result.body.items.find(r => r.student.id === '3').eligible, false);
      assert.equal(result.body.items[0].student.batch, 'Target');
      assert.equal(result.body.items[0].compatibility, 90);
      assert.equal((await request('/companies', 2)).body.items[0].eligibleBatches[0].name, 'Target');
    });
    await t.test('multiple batches, deduplication, pagination, searching and skills', async () => {
      assert.equal((await request(`/companies/${id}`, 1, 'PATCH', { eligibleBatchIds: [2,3,2] })).status, 200);
      const result = (await match()).body;
      assert.equal(result.total, 3);
      assert.equal(new Set(result.items.map(r => r.student.id)).size, 3);
      assert.equal(result.items.find(r => r.student.id === '4').eligible, false);
      assert.equal((await match({ filters: { eligibility: 'eligible' } })).body.total, 1);
      const first = (await match({ page: 1, pageSize: 1 })).body;
      const second = (await match({ page: 2, pageSize: 1 })).body;
      assert.equal(first.total, 3); assert.notEqual(first.items[0].student.id, second.items[0].student.id);
      assert.equal((await match({ filters: { q: 'outsider' } })).body.total, 0);
      assert.equal((await match({ filters: { q: 'Second' } })).body.total, 1);
    });
    await t.test('trainer override and reset cannot expand saved batch population', async () => {
      const result = (await match({ eligibleBatchIds: ['1'], criteriaOverride: { minCgpa: 0, criteria: [], eligibleBatchIds: ['1'] } })).body;
      assert.equal(result.total, 3); assert(result.items.every(r => r.eligible));
      assert(result.items.every(r => ['2','3'].includes(r.student.batchId)));
      const reset = (await match()).body;
      assert.equal(reset.items.filter(r => r.eligible).length, 1);
      const project = (await match({ criteriaOverride: { criteria: [{ skillId: 'PROJECT_SCORE', type: 'PROJECT_SCORE', minCutoff: 60, weightage: 1, mandatory: true }] } })).body;
      assert(project.items.every(r => !r.eligible && r.failedRequirements.some(message => message.includes('PROJECT SCORE'))));
      await client.query(`INSERT INTO projects (project_id,student_id,project_name,ownership_status) VALUES (1,2,'Verified project','VERIFIED')`);
      await client.query(`INSERT INTO project_reviews (project_id,reviewer_id,review_status) VALUES (1,2,'APPROVED')`);
      await client.query(`INSERT INTO project_score_snapshots (project_id,final_score,formula_version) VALUES (1,80,'test')`);
      const weighted = (await match({ criteriaOverride: { criteria: [
        { skillId: 'dsa', minCutoff: 95, weightage: 0.5, mandatory: false },
        { skillId: 'PROJECT_SCORE', type: 'PROJECT_SCORE', minCutoff: 60, weightage: 0.5, mandatory: true },
      ] } })).body.items.find(r => r.student.id === '2');
      assert.equal(weighted.eligible, true); assert.equal(weighted.compatibility, 85);
    });
    await t.test('admin edits, empty batches and legacy unconfigured companies', async () => {
      await request(`/companies/${id}`, 1, 'PATCH', { eligibleBatchIds: ['3'] });
      assert.deepEqual((await match()).body.items.map(r => r.student.id), ['4']);
      await request(`/companies/${id}`, 1, 'PATCH', { eligibleBatchIds: ['4'] });
      const empty = (await match()).body; assert.equal(empty.total, 0); assert.equal(empty.requiresBatchConfiguration, false);
      const legacy = await client.query(`INSERT INTO company_roles (company_name,role_title) VALUES ('Legacy','Engineer') RETURNING role_id`);
      const unmatched = await request(`/companies/${legacy.rows[0].role_id}/matches`, 2, 'POST', {});
      assert.equal(unmatched.body.total, 0); assert.equal(unmatched.body.requiresBatchConfiguration, true);
      assert.equal((await request(`/companies/${legacy.rows[0].role_id}`, 1, 'PATCH', { name: 'Still legacy' })).status, 400);
    });
    await t.test('invalid batch IDs and criteria cannot partially update a company', async () => {
      for (const ids of [[], ['999999'], ['bad'], [0], [null]]) {
        assert.equal((await request(`/companies/${id}`, 1, 'PATCH', { name: 'Should not save', eligibleBatchIds: ids })).status, 400);
      }
      for (const patch of [{ minCgpa: 11 }, { criteria: [{ ...profile.criteria[0], weightage: -1 }] }, { criteria: [profile.criteria[0], profile.criteria[0]] }]) {
        assert.equal((await request(`/companies/${id}`, 1, 'PATCH', patch)).status, 400);
      }
      await client.query(`UPDATE academic_batches SET status='archived' WHERE academic_batch_id=4`);
      assert.equal((await request(`/companies/${id}`, 1, 'PATCH', { eligibleBatchIds: ['4'] })).status, 400);
      await client.query(`UPDATE academic_batches SET status='active' WHERE academic_batch_id=4`);
      const saved = (await request(`/companies/${id}`)).body;
      assert.equal(saved.name, profile.name); assert.deepEqual(saved.eligibleBatchIds, ['4']);
      assert.deepEqual(saved.criteria, profile.criteria);
    });
    await t.test('authorization blocks trainer writes and student access', async () => {
      assert.equal((await request('/companies', 2, 'POST', profile)).status, 403);
      assert.equal((await request(`/companies/${id}`, 2, 'PATCH', { eligibleBatchIds: ['1'] })).status, 403);
      assert.equal((await request(`/companies/${id}`, 2, 'DELETE')).status, 403);
      assert.equal((await request(`/companies/${id}/matches`, 3, 'POST', {})).status, 403);
    });
    await t.test('failure after company write rolls back requirements and batch replacement', async () => {
      await client.query(`CREATE FUNCTION reject_test_batch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.batch_id = 1 THEN RAISE EXCEPTION 'Test association failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER reject_test_batch BEFORE INSERT ON company_eligible_batches FOR EACH ROW EXECUTE FUNCTION reject_test_batch()`);
      const failed = await request(`/companies/${id}`, 1, 'PATCH', { name: 'Must roll back', eligibleBatchIds: ['1'] });
      assert.equal(failed.status, 500);
      const saved = (await request(`/companies/${id}`)).body;
      assert.equal(saved.name, profile.name); assert.deepEqual(saved.eligibleBatchIds, ['4']);
      await client.query(`DROP TRIGGER reject_test_batch ON company_eligible_batches`);
    });
    await t.test('saved configuration survives server restart and a new DB connection', async () => {
      await new Promise(resolve => server.close(resolve)); await listen();
      assert.deepEqual((await request(`/companies/${id}`, 2)).body.eligibleBatchIds, ['4']);
      const fresh = await originalConnect.call(pool);
      try {
        const persisted = await fresh.query(`SELECT batch_id::text FROM ${schema}.company_eligible_batches WHERE company_id=$1`, [id]);
        assert.deepEqual(persisted.rows.map(r => r.batch_id), ['4']);
      } finally { fresh.release(); }
    });
    await t.test('foreign keys and company deletion clean up only associations', async () => {
      assert.equal((await request(`/companies/${id}`, 1, 'DELETE')).status, 204);
      assert.equal((await client.query(`SELECT * FROM company_eligible_batches WHERE company_id=$1`, [id])).rowCount, 0);
      assert.equal((await client.query(`SELECT * FROM academic_batches`)).rowCount, 4);
      assert.equal((await client.query(`SELECT * FROM students`)).rowCount, 5);
    });
    await t.test('CSV exports exactly ten cross-page selections with dynamic scores, ranks and contact fields', async () => {
      await client.query(`INSERT INTO students (student_id,roll_no,full_name,email,academic_batch_id,section,cgpa)
        SELECT n, lpad(n::text,5,'0'), 'Export student ' || n, 'export' || n || '@test.invalid',
          CASE WHEN n % 2 = 0 THEN 2 ELSE 3 END, CASE WHEN n=20 THEN NULL ELSE 'B' END, 8
        FROM generate_series(10,21) n`);
      await client.query(`UPDATE students SET full_name=$1, custom_profile_fields=$2 WHERE student_id=20`,
        ['Student, "Quoted"\nName', JSON.stringify({ mobileNumber: '09876543210' })]);
      await client.query(`INSERT INTO evaluation_records (record_id,batch_id,student_id) SELECT student_id,1,student_id FROM students WHERE student_id>=10`);
      await client.query(`INSERT INTO skill_ratings (student_id,skill_id,score_percentage,source_type,source_id)
        SELECT student_id,1,60+student_id,'EXAM',student_id FROM students WHERE student_id>=10`);
      const company = (await request('/companies', 1, 'POST', { ...profile, name: 'CSV Company', eligibleBatchIds: ['2','3'] })).body;
      const route = `/companies/${company.id}`;
      const pages = await Promise.all([1,2,3,4].map(page => request(`${route}/matches`, 2, 'POST', { page, pageSize: 4 })));
      const all = pages.flatMap(page => page.body.items).filter(r => r.eligible);
      const selected = all.slice(0,10);
      const payload = { selectedStudentIds: [...selected].reverse().map(r => r.student.id), matchingVersion: pages[0].body.matchingVersion };
      payload.selectedStudentIds.push(selected[0].student.id);
      const result = await request(`${route}/shortlist-export`, 2, 'POST', payload);
      assert.equal(result.status, 200, JSON.stringify(result.body)); assert.equal(result.body.rowCount, 10);
      assert(result.body.csv.startsWith('\uFEFF')); assert.match(result.body.fileName, /^CSV_Company_Engineer_Shortlist_\d{4}-\d{2}-\d{2}\.csv$/);
      const XLSX = require('xlsx');
      const parse = csv => { const book = XLSX.read(Buffer.from(csv, 'utf8'), { type: 'buffer', raw: true }); return XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: '' }); };
      const data = parse(result.body.csv);
      assert.deepEqual(data[0], ['Rank','Roll Number','Name','Mobile Number','Email','Section','Batch','CGPA','DSA','Compatibility %']);
      assert.equal(data.length, 11);
      for (let i=0; i<selected.length; i++) {
        const row = data[i+1], shown = selected[i];
        assert.equal(Number(row[0]), i+1); assert.equal(row[2], shown.student.name);
        assert.equal(row[4], shown.student.email); assert.equal(row[6], shown.student.batch);
        assert.equal(Number(row[8]), shown.student.scores.dsa); assert.equal(Number(row[9]), shown.compatibility);
      }
      const special = data.find(row => row[2] === 'Student, "Quoted"\nName');
      assert.equal(special[1], '="00020"'); assert.equal(special[3], '="09876543210"'); assert.equal(special[5], '');
      assert(data.slice(1).some(row => row[3] === ''));
      assert.equal(new Set(data.slice(1).map(row => row[6])).size, 2);
      for (const selectedStudentIds of [['1'], ['3'], ['99999']]) {
        assert.equal((await request(`${route}/shortlist-export`, 2, 'POST', { ...payload, selectedStudentIds })).status, 422);
      }
      assert.equal((await request(`${route}/shortlist-export`, 2, 'POST', { ...payload, selectedStudentIds: [] })).status, 400);
      assert.equal((await request(`${route}/shortlist-export`, 3, 'POST', payload)).status, 403);
      assert.equal((await request(`${route}/shortlist-export`, 0, 'POST', payload)).status, 401);
      assert.equal((await request(`${route}/shortlist-export`, 2, 'POST', { ...payload, criteriaOverride: { criteria: [] } })).status, 409);
      assert.equal((await request(`${route}/shortlist-export`, 2, 'POST', { ...payload, matchingVersion: 'stale' })).status, 409);
      await client.query(`UPDATE skill_ratings SET score_percentage=99 WHERE student_id=21`);
      assert.equal((await request(`${route}/shortlist-export`, 2, 'POST', payload)).status, 409);

      const projectCompany = (await request('/companies', 1, 'POST', { ...profile, eligibleBatchIds: ['2'],
        criteria: [{ skillId: 'PROJECT_SCORE', type: 'PROJECT_SCORE', minCutoff: 0, weightage: 1, mandatory: false }] })).body;
      await client.query(`UPDATE projects SET repository_url='https://github.com/student/alpha' WHERE project_id=1`);
      await client.query(`INSERT INTO projects (project_id,student_id,project_name,ownership_status,repository_url) VALUES
        (2,2,'Second approved project','VERIFIED','https://github.com/student/beta'),
        (3,2,'Unverified project','PENDING','https://github.com/student/unverified'),
        (4,2,'Unapproved project','VERIFIED','https://github.com/student/unapproved'),
        (5,2,'Other host','VERIFIED','https://example.com/student/repo')`);
      await client.query(`INSERT INTO project_reviews (project_id,reviewer_id,review_status) VALUES (2,2,'APPROVED'),(3,2,'APPROVED'),(4,2,'DRAFT'),(5,2,'APPROVED')`);
      await client.query(`INSERT INTO project_score_snapshots (project_id,final_score,formula_version) VALUES (2,80,'test'),(3,80,'test'),(4,80,'test'),(5,80,'test')`);
      const override = { minCgpa: 7.5, criteria: [{ skillId: 'PROJECT_SCORE', type: 'PROJECT_SCORE', minCutoff: 10, weightage: 0.5, mandatory: false }] };
      const projectMatches = (await request(`/companies/${projectCompany.id}/matches`, 2, 'POST', { criteriaOverride: override })).body;
      const exported = await request(`/companies/${projectCompany.id}/shortlist-export`, 2, 'POST', {
        selectedStudentIds: ['2','20'], criteriaOverride: override, matchingVersion: projectMatches.matchingVersion,
      });
      assert.equal(exported.status, 200, JSON.stringify(exported.body));
      const projectCsv = parse(exported.body.csv);
      assert.equal(projectCsv[0][8], 'Verified project score'); assert(!projectCsv[0].includes('DSA'));
      assert.equal(projectCsv[0][9], 'Project GitHub Links'); assert.equal(projectCsv[0][10], 'Compatibility %');
      assert.equal(Number(projectCsv[1][8]), 80); assert.equal(Number(projectCsv[1][10]), 80);
      assert.equal(projectCsv[1][9], 'https://github.com/student/alpha\nhttps://github.com/student/beta');
      assert.equal(projectCsv[2][8], ''); assert.equal(projectCsv[2][9], ''); assert.equal(Number(projectCsv[2][10]), 0);
    });
  } finally {
    t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    pool.query = originalQuery; pool.connect = originalConnect;
    await client.query('ROLLBACK');
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    client.release(); await pool.end();
    });
  }
});
