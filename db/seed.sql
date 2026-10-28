DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM import_batches WHERE event_title = 'Baseline Diagnostic Assessment') THEN
INSERT INTO users (email, password_hash, full_name, role) VALUES
('admin@college.edu', 'hashed_pass', 'Placement Admin', 'ADMIN'),
('trainer@college.edu', 'hashed_pass', 'Vikram Sir (Tech Trainer)', 'TRAINER'),
('advay@college.edu', 'hashed_pass', 'Advay Sharma', 'STUDENT');

-- Seed 4 Domains & Core Skills
INSERT INTO skill_taxonomy (skill_name, domain_category) VALUES
('DSA', 'Programming & Problem Solving'),
('OOPS', 'Programming & Problem Solving'),
('Java', 'Software Development'),
('Spring Boot', 'Software Development'),
('DBMS', 'Core Computer Science'),
('OS', 'Core Computer Science'),
('CN', 'Core Computer Science'),
('Communication', 'Employability & Soft Skills');

-- Seed Students (including Advay Sharma from your wireframe)
INSERT INTO students (user_id, roll_no, full_name, email, batch, branch, cgpa, readiness_status, persona_badges, custom_profile_fields) VALUES
(3, 'CSE22001', 'Advay Sharma', 'advay@college.edu', '2022-2026', 'CSE', 8.45, 'PR', '["DSA Strong", "Development Strong"]'::jsonb, '{"github": "github.com/advay", "hackathon_winner": "Yes"}'::jsonb),
(NULL, 'CSE22002', 'Riya Patel', 'riya@college.edu', '2022-2026', 'CSE', 8.90, 'PR', '["All-Rounder", "Core CS Strong"]'::jsonb, '{"github": "github.com/riyap", "certifications": "AWS Cloud"}'::jsonb),
(NULL, 'CSE22003', 'Aarav Mehta', 'aarav@college.edu', '2022-2026', 'CSE', 7.20, 'NPR', '["Needs Targeted Training"]'::jsonb, '{"backlogs": 0}'::jsonb),
(NULL, 'CSE22004', 'Sneha Iyer', 'sneha@college.edu', '2022-2026', 'CSE', 8.10, 'PR', '["Development Strong", "Communication Strong"]'::jsonb, '{"internship": "Fintech Intern"}'::jsonb),
(NULL, 'CSE22005', 'Kabir Verma', 'kabir@college.edu', '2022-2026', 'CSE', 7.65, 'NPR', '["DSA Strong"]'::jsonb, '{"leetcode_solved": 320}'::jsonb);

-- Seed Baseline Import Batch
INSERT INTO import_batches (uploaded_by, event_type, event_title, original_filename, column_mapping_config, total_rows_processed)
VALUES (2, 'EXAM', 'Baseline Diagnostic Assessment', 'baseline_assessment.xlsx',
        '{"rollNoColumn": "Roll_No", "eventType": "EXAM"}'::jsonb, 5);

-- Seed Baseline Evaluation Records
INSERT INTO evaluation_records (batch_id, student_id, overall_score_pct, strengths, weaknesses, behavior_remarks, raw_excel_row, custom_attributes) VALUES
(1, 1, 78.50, 'Strong graph & tree problem solving, clean Java code', 'Needs deeper indexing & normalization revision in DBMS', 'Attentive and proactive in lab sessions',
 '{"Roll_No": "CSE22001", "Name": "Advay Sharma", "DSA": 88, "DBMS": 54, "Java": 85, "Spring Boot": 82}'::jsonb,
 '{"Attendance_Pct": "94%", "Lab_Mentor": "Prof. Rao"}'::jsonb),
(1, 2, 86.00, 'Excellent across OS, DBMS, DSA and Spring Boot', 'Can speak slightly slower during technical explanations', 'Consistent top performer',
 '{"Roll_No": "CSE22002", "Name": "Riya Patel", "DSA": 85, "DBMS": 90, "Java": 88, "Spring Boot": 84}'::jsonb,
 '{"Attendance_Pct": "98%", "Lab_Mentor": "Prof. Rao"}'::jsonb),
(1, 3, 52.00, 'Basic syntax is clear', 'Struggles with Dynamic Programming, OS deadlocks, and Spring REST APIs', 'Needs regular follow-up and mock practice',
 '{"Roll_No": "CSE22003", "Name": "Aarav Mehta", "DSA": 48, "DBMS": 55, "Java": 58, "Spring Boot": 45}'::jsonb,
 '{"Attendance_Pct": "76%", "Warning_Issued": "Yes"}'::jsonb),
(1, 4, 79.00, 'Great Spring Boot & Java architecture skills, fluent communicator', 'Graph algorithms and bit manipulation need practice', 'Strong team player',
 '{"Roll_No": "CSE22004", "Name": "Sneha Iyer", "DSA": 68, "DBMS": 78, "Java": 88, "Spring Boot": 91}'::jsonb,
 '{"Attendance_Pct": "91%", "Project_Role": "Backend Lead"}'::jsonb),
(1, 5, 71.00, 'Very fast at competitive coding & DSA', 'Weak in communication and core DBMS/OS theory', 'Quiet during group discussions',
 '{"Roll_No": "CSE22005", "Name": "Kabir Verma", "DSA": 91, "DBMS": 58, "Java": 76, "Spring Boot": 62}'::jsonb,
 '{"Attendance_Pct": "85%", "Contest_Rank": 4}'::jsonb);

-- Seed Baseline Skill Ratings (Skill IDs: 1=DSA, 2=OOPS, 3=Java, 4=Spring Boot, 5=DBMS, 6=OS, 7=CN, 8=Communication)
INSERT INTO skill_ratings (student_id, skill_id, score_percentage, source_type, source_id) VALUES
-- Advay Sharma (Matches wireframe: strong DSA/OOPS/Java, weaker DBMS)
(1, 1, 88.0, 'EXAM', 1), (1, 2, 84.0, 'EXAM', 1), (1, 3, 85.0, 'EXAM', 1), (1, 4, 82.0, 'EXAM', 1),
(1, 5, 54.0, 'EXAM', 1), (1, 6, 72.0, 'EXAM', 1), (1, 7, 76.0, 'EXAM', 1), (1, 8, 79.0, 'EXAM', 1),
-- Riya Patel
(2, 1, 85.0, 'EXAM', 2), (2, 2, 89.0, 'EXAM', 2), (2, 3, 88.0, 'EXAM', 2), (2, 4, 84.0, 'EXAM', 2),
(2, 5, 90.0, 'EXAM', 2), (2, 6, 86.0, 'EXAM', 2), (2, 7, 84.0, 'EXAM', 2), (2, 8, 82.0, 'EXAM', 2),
-- Aarav Mehta
(3, 1, 48.0, 'EXAM', 3), (3, 2, 55.0, 'EXAM', 3), (3, 3, 58.0, 'EXAM', 3), (3, 4, 45.0, 'EXAM', 3),
(3, 5, 55.0, 'EXAM', 3), (3, 6, 50.0, 'EXAM', 3), (3, 7, 52.0, 'EXAM', 3), (3, 8, 60.0, 'EXAM', 3),
-- Sneha Iyer
(4, 1, 68.0, 'EXAM', 4), (4, 2, 82.0, 'EXAM', 4), (4, 3, 88.0, 'EXAM', 4), (4, 4, 91.0, 'EXAM', 4),
(4, 5, 78.0, 'EXAM', 4), (4, 6, 74.0, 'EXAM', 4), (4, 7, 72.0, 'EXAM', 4), (4, 8, 89.0, 'EXAM', 4),
-- Kabir Verma
(5, 1, 91.0, 'EXAM', 5), (5, 2, 78.0, 'EXAM', 5), (5, 3, 76.0, 'EXAM', 5), (5, 4, 62.0, 'EXAM', 5),
(5, 5, 58.0, 'EXAM', 5), (5, 6, 61.0, 'EXAM', 5), (5, 7, 60.0, 'EXAM', 5), (5, 8, 59.0, 'EXAM', 5);

-- Seed Company Roles (Infosys & Cognizant from prompt)
INSERT INTO company_roles (company_name, role_title, package_lpa, min_cgpa, skill_weights, skill_cutoffs) VALUES
('Infosys', 'Digital Specialist Engineer (DSE)', 6.50, 6.50,
 '{"DSA": 0.50, "OOPS": 0.20, "DBMS": 0.15, "Communication": 0.15}'::jsonb,
 '{"DSA": 75, "Communication": 65}'::jsonb),
('Cognizant', 'GenC Next - Java Full Stack', 6.75, 6.50,
 '{"Java": 0.35, "Spring Boot": 0.35, "DBMS": 0.15, "Communication": 0.15}'::jsonb,
 '{"Java": 75, "Spring Boot": 75}'::jsonb);

PERFORM setval(pg_get_serial_sequence('users', 'user_id'), (SELECT MAX(user_id) FROM users));
PERFORM setval(pg_get_serial_sequence('students', 'student_id'), (SELECT MAX(student_id) FROM students));
PERFORM setval(pg_get_serial_sequence('skill_taxonomy', 'skill_id'), (SELECT MAX(skill_id) FROM skill_taxonomy));
PERFORM setval(pg_get_serial_sequence('import_batches', 'batch_id'), (SELECT MAX(batch_id) FROM import_batches));
PERFORM setval(pg_get_serial_sequence('evaluation_records', 'record_id'), (SELECT MAX(record_id) FROM evaluation_records));
PERFORM setval(pg_get_serial_sequence('skill_ratings', 'rating_id'), (SELECT MAX(rating_id) FROM skill_ratings));
PERFORM setval(pg_get_serial_sequence('company_roles', 'role_id'), (SELECT MAX(role_id) FROM company_roles));
    END IF;
END $$;
