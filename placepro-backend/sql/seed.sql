-- ============================================================================
-- PLACEPRO DEMO SEED DATA (Password for all demo accounts: 'secret')
-- Bcrypt hash for 'secret': $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
-- ============================================================================

INSERT INTO users (email, password_hash, full_name, role, title, status)
VALUES
  ('admin@example.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Rajesh Kumar', 'ADMIN', 'Placement Director', 'active'),
  ('trainer@example.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Priya Nair', 'TRAINER', 'Technical Trainer', 'active'),
  ('ananya@example.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Ananya Sharma', 'STUDENT', 'Student', 'active')
ON CONFLICT (email) DO NOTHING;

INSERT INTO academic_batches (name, department, academic_years, sections, trainer_ids, status)
VALUES
  ('2022–2026 CSE', 'Computer Science & Engineering', '2022 – 2026', '["A", "B"]'::jsonb, '[2]'::jsonb, 'active')
ON CONFLICT (name) DO NOTHING;

INSERT INTO students (user_id, academic_batch_id, roll_no, full_name, email, batch, branch, section, cgpa, average_score, readiness_status)
VALUES
  (3, 1, '22CS041', 'Ananya Sharma', 'ananya@example.com', '2022–2026 CSE', 'CSE', 'A', 8.10, 77.70, 'PR'),
  (NULL, 1, '22CS042', 'Rohan Verma', 'rohan@example.com', '2022–2026 CSE', 'CSE', 'A', 6.40, 58.00, 'NPR')
ON CONFLICT (roll_no) DO NOTHING;

INSERT INTO skill_taxonomy (skill_code, skill_name, domain_category, description, parameter_type, is_active)
VALUES
  ('dsa', 'DSA', 'Programming & Problem Solving', 'Data structures and algorithms', 'numeric', TRUE),
  ('dbms', 'DBMS', 'Core Computer Science', 'Database management systems and SQL', 'numeric', TRUE),
  ('comm', 'Communication', 'Employability & Soft Skills', 'Verbal and structured communication', 'numeric', TRUE)
ON CONFLICT (skill_code) DO NOTHING;

INSERT INTO company_roles (company_name, role_title, industry, package_lpa, min_cgpa, criteria_json)
VALUES
  ('Infosys', 'Systems Engineer', 'IT Services', 6.50, 7.00, '[{"skillId":"dsa","minCutoff":60,"weightage":0.35,"mandatory":true},{"skillId":"comm","minCutoff":60,"weightage":0.25,"mandatory":true}]'::jsonb);
