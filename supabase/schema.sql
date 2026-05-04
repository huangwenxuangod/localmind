-- MiniClaw · 美团同城行程规划 Agent Demo Schema v2
-- 在 Supabase SQL Editor 中执行。可重复执行。
-- Demo 运行时所有写入都走 Next.js API；可用 secret/service_role key，
-- 也可用 publishable/anon key + 下方 demo RLS policy。

-- 1. 会话表
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','abandoned')),
  current_plan_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 行程方案表
CREATE TABLE IF NOT EXISTS plans (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  raw_input        TEXT NOT NULL DEFAULT '',
  brief            JSONB NOT NULL DEFAULT '{}',
  reasoning        JSONB NOT NULL DEFAULT '{}',
  validation       JSONB NOT NULL DEFAULT '[]',
  score            JSONB NOT NULL DEFAULT '{}',
  planner_source   TEXT NOT NULL DEFAULT 'local'
    CHECK (planner_source IN ('llm','local')),
  llm_draft        JSONB,
  fallback_reason  TEXT,
  status           TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('parsing','planning','validating','draft','ready','confirmed','executing','completed','failed','cancelled')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 兼容旧版本：CREATE TABLE IF NOT EXISTS 不会给旧表补列，所以这里显式补齐 v2 列。
ALTER TABLE plans ADD COLUMN IF NOT EXISTS raw_input TEXT NOT NULL DEFAULT '';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS brief JSONB NOT NULL DEFAULT '{}';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS reasoning JSONB NOT NULL DEFAULT '{}';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS validation JSONB NOT NULL DEFAULT '[]';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS score JSONB NOT NULL DEFAULT '{}';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS planner_source TEXT NOT NULL DEFAULT 'local';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS llm_draft JSONB;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS fallback_reason TEXT;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS intent JSONB NOT NULL DEFAULT '{}';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS constraint_level INT NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sessions_current_plan_id_fkey'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_current_plan_id_fkey
      FOREIGN KEY (current_plan_id) REFERENCES plans(id) ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

-- 3. 行程卡任务表
CREATE TABLE IF NOT EXISTS tasks (
  id                  TEXT PRIMARY KEY,
  plan_id             TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  business_type       TEXT NOT NULL,
  title               TEXT NOT NULL DEFAULT '',
  description         TEXT,
  merchant            JSONB,
  candidate_merchants JSONB NOT NULL DEFAULT '[]',
  start_time          TIMESTAMPTZ NOT NULL,
  end_time            TIMESTAMPTZ NOT NULL,
  duration_min        INT NOT NULL,
  travel_to_next_min  INT NOT NULL DEFAULT 0,
  why_recommended     TEXT,
  suitability_tags    TEXT[] NOT NULL DEFAULT '{}',
  validation          JSONB NOT NULL DEFAULT '[]',
  status              TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('pending','validating','ready','executing','success','failed','replaced','replanning')),
  failure_reason      TEXT,
  replaced_from       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 兼容旧版本：补齐 v2 行程卡列；type/retry_count 不再作为产品逻辑使用。
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS why_recommended TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS suitability_tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS validation JSONB NOT NULL DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'weak';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;

-- 4. mock 履约记录
CREATE TABLE IF NOT EXISTS executions (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  plan_id        TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  task_id        TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  success        BOOLEAN NOT NULL,
  merchant       JSONB,
  failure_reason TEXT,
  executed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. 商家数据表（mock 数据持久化备份，可选）
CREATE TABLE IF NOT EXISTS merchants (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,
  address         TEXT,
  lat             NUMERIC(10,6),
  lng             NUMERIC(10,6),
  rating          NUMERIC(3,1),
  price_level     INT,
  capacity        INT,
  open_hours      JSONB NOT NULL DEFAULT '[]',
  tags            TEXT[] NOT NULL DEFAULT '{}',
  scene_blacklist TEXT[] NOT NULL DEFAULT '{}',
  dietary_support TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. 系统日志：记录 LLM draft、规则修正、score、错误
CREATE TABLE IF NOT EXISTS system_logs (
  id          BIGSERIAL PRIMARY KEY,
  session_id  TEXT,
  plan_id     TEXT,
  level       TEXT NOT NULL CHECK (level IN ('info','warn','error','replan')),
  phase       TEXT,
  message     TEXT NOT NULL,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_plans_session_id    ON plans(session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_plan_id       ON tasks(plan_id);
CREATE INDEX IF NOT EXISTS idx_executions_task_id  ON executions(task_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_session ON system_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_level   ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at DESC);

-- RLS / API key 说明：
-- Supabase 新 key 体系中：
-- - sb_publishable_* 对应旧 anon，用于低权限公开访问
-- - sb_secret_* 对应旧 service_role，用于服务端高权限访问
-- 当前 demo 没有登录用户，若使用 publishable key，必须允许 anon 访问 demo 表。
-- 这些 policy 只适合 demo，不适合生产多用户数据隔离。

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "demo_anon_all_sessions" ON sessions;
DROP POLICY IF EXISTS "demo_anon_all_plans" ON plans;
DROP POLICY IF EXISTS "demo_anon_all_tasks" ON tasks;
DROP POLICY IF EXISTS "demo_anon_all_executions" ON executions;
DROP POLICY IF EXISTS "demo_anon_all_system_logs" ON system_logs;

CREATE POLICY "demo_anon_all_sessions"
  ON sessions FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "demo_anon_all_plans"
  ON plans FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "demo_anon_all_tasks"
  ON tasks FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "demo_anon_all_executions"
  ON executions FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "demo_anon_all_system_logs"
  ON system_logs FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
