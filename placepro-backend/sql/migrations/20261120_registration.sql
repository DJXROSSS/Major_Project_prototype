BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_unique ON users (lower(btrim(email)));
CREATE UNIQUE INDEX IF NOT EXISTS students_email_normalized_unique ON students (lower(btrim(email)));
CREATE UNIQUE INDEX IF NOT EXISTS students_roll_normalized_unique ON students (upper(btrim(roll_no)));
COMMIT;
