-- ================================================================
-- Studio 用户数据同步（增量脚本）
-- 仅用于已有数据库的补丁执行
-- ================================================================

CREATE TABLE IF NOT EXISTS studio_user_data (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data JSONB DEFAULT '{}' NOT NULL,
    version INTEGER DEFAULT 1 NOT NULL,
    client_updated_at BIGINT DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE studio_user_data ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY studio_user_data_select ON studio_user_data
        FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY studio_user_data_insert ON studio_user_data
        FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY studio_user_data_update ON studio_user_data
        FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
