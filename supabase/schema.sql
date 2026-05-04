-- MiniClaw · 美团同城行程规划 Agent Demo Schema v2
-- 在 Supabase SQL Editor 中执行。可重复执行。
-- Demo 运行时所有写入都走 Next.js API + SUPABASE_SERVICE_ROLE_KEY。

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

-- 兼容旧版本：旧代码曾把全部 plan payload 塞进 intent/constraint_level。
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

-- 兼容旧版本：不再作为产品逻辑使用。
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

-- RLS 说明：
-- Demo 阶段推荐所有 Supabase 写入都走服务端 SUPABASE_SERVICE_ROLE_KEY。
-- 如果启用 RLS，不需要给 anon/publishable key 写入策略。
