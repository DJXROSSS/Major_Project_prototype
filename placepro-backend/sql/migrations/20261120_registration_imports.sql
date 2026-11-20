BEGIN;
CREATE TABLE IF NOT EXISTS registration_imports (
    import_id UUID PRIMARY KEY,
    created_by BIGINT NOT NULL REFERENCES users(user_id),
    account_role VARCHAR(10) NOT NULL CHECK (account_role IN ('STUDENT', 'TRAINER')),
    academic_batch_id BIGINT REFERENCES academic_batches(academic_batch_id) ON DELETE SET NULL,
    source_filename VARCHAR(255) NOT NULL,
    submitted_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(12) NOT NULL DEFAULT 'PREVIEW' CHECK (status IN ('PREVIEW', 'CONFIRMED')),
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);
CREATE INDEX IF NOT EXISTS registration_imports_owner_idx ON registration_imports(created_by,created_at DESC);
COMMIT;
