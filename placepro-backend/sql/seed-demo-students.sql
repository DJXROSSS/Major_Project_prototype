-- PlacePro demo roster: four CSE batches, exactly 100 students per batch.
-- Safe to re-run: existing students are preserved and only missing rows are added.
DO $$
DECLARE
  batch_record RECORD;
  current_count INT;
  student_number INT;
  batch_specs JSONB := '[
    {"name":"2022–2026 CSE","years":"2022–2026","prefix":"22CS"},
    {"name":"2023–2027 CSE","years":"2023–2027","prefix":"23CS"},
    {"name":"2024–2028 CSE","years":"2024–2028","prefix":"24CS"},
    {"name":"2025–2029 CSE","years":"2025–2029","prefix":"25CS"}
  ]'::jsonb;
BEGIN
  FOR batch_record IN
    SELECT value->>'name' AS name, value->>'years' AS years, value->>'prefix' AS prefix
    FROM jsonb_array_elements(batch_specs)
  LOOP
    INSERT INTO academic_batches (name, department, academic_years, sections, trainer_ids, status)
    VALUES (batch_record.name, 'Computer Science & Engineering', batch_record.years, '["A", "B"]'::jsonb, '[2]'::jsonb, 'active')
    ON CONFLICT (name) DO NOTHING;

    SELECT COUNT(*)::INT INTO current_count
    FROM students s
    JOIN academic_batches ab ON ab.academic_batch_id = s.academic_batch_id
    WHERE ab.name = batch_record.name;

    -- Continue beyond 100 if necessary so existing roll-number collisions do
    -- not leave a batch short of its target roster size.
    FOR student_number IN 1..150 LOOP
      INSERT INTO students
        (academic_batch_id, roll_no, full_name, email, batch, branch, section, cgpa, average_score, readiness_status)
      SELECT
        ab.academic_batch_id,
        batch_record.prefix || LPAD(student_number::TEXT, 3, '0'),
        'Student ' || batch_record.prefix || LPAD(student_number::TEXT, 3, '0'),
        LOWER(batch_record.prefix) || LPAD(student_number::TEXT, 3, '0') || '@campus.edu',
        batch_record.name,
        'CSE',
        CASE WHEN student_number <= 50 THEN 'A' ELSE 'B' END,
        ROUND((6.00 + ((student_number % 31) / 10.0))::NUMERIC, 2),
        ROUND((55.00 + ((student_number * 7) % 41))::NUMERIC, 2),
        CASE WHEN student_number % 3 = 0 THEN 'PR'::readiness_status ELSE 'NPR'::readiness_status END
      FROM academic_batches ab
      WHERE ab.name = batch_record.name
        AND (SELECT COUNT(*) FROM students WHERE academic_batch_id = ab.academic_batch_id) < 100
      ON CONFLICT (roll_no) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

