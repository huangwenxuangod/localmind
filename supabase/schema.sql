-- AI同城行程履约系统 · Supabase Schema
-- 执行顺序：依次运行即可

-- 1. 会话表
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','abandoned')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 行程方案表
CREATE TABLE IF NOT EXISTS plans (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  intent           JSONB NOT NULL,          -- ParsedIntent
  status           TEXT NOT NULL DEFAULT 'planning',
  constraint_level INT  NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 任务明细表
CREATE TABLE IF NOT EXISTS tasks (
  id                  TEXT PRIMARY KEY,
  plan_id             TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN ('core','weak')),
  business_type       TEXT NOT NULL,
  merchant            JSONB,
  candidate_merchants JSONB NOT NULL DEFAULT '[]',
  start_time          TIMESTAMPTZ NOT NULL,
  end_time            TIMESTAMPTZ NOT NULL,
  duration_min        INT  NOT NULL,
  travel_to_next_min  INT  NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'pending',
  retry_count         INT  NOT NULL DEFAULT 0,
  failure_reason      TEXT,
  replaced_from       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. 执行记录表
CREATE TABLE IF NOT EXISTS executions (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  plan_id        TEXT NOT NULL,
  success        BOOLEAN NOT NULL,
  merchant       JSONB,
  failure_reason TEXT,
  executed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. 商家数据表（Mock数据持久化备份）
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

-- 6. 用户自定义场景模板表
CREATE TABLE IF NOT EXISTS templates (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name        TEXT NOT NULL,
  scene_tag   TEXT NOT NULL,
  rules       JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. 系统日志表
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

-- 8. 用户记忆表（Agent Memory V1.0）
-- 单字段 markdown 管理，LLM 直接读写
CREATE TABLE IF NOT EXISTS user_profiles (
  id         TEXT PRIMARY KEY,
  memory_md  TEXT NOT NULL DEFAULT '', -- 完整记忆文档（markdown）
  summary    TEXT NOT NULL DEFAULT '', -- LLM 压缩的 200 字摘要
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- sessions 补充字段（V1.0 集成）
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL;

-- 索引
CREATE INDEX IF NOT EXISTS idx_plans_session_id      ON plans(session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_plan_id         ON tasks(plan_id);
CREATE INDEX IF NOT EXISTS idx_executions_task_id    ON executions(task_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_session   ON system_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_level     ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_created   ON system_logs(created_at DESC);
