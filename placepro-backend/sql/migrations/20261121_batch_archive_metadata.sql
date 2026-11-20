ALTER TABLE academic_batches
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS archived_by BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_academic_batches_archived_by'
  ) THEN
    ALTER TABLE academic_batches
      ADD CONSTRAINT fk_academic_batches_archived_by
      FOREIGN KEY (archived_by) REFERENCES users(user_id) ON DELETE SET NULL;
  END IF;
END $$;
