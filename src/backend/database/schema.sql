-- ============================================
-- PAIAgent Database Schema
-- ============================================

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT DEFAULT 'main_agent',
  title TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

 
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_call_id TEXT,
  tool_calls TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  key TEXT NOT NULL,                       -- Key of the memory
  value TEXT NOT NULL,                     -- Value of the memory
  category TEXT DEFAULT 'personal' CHECK(category IN ('personal', 'preference', 'event', 'goal', 'task', 'information', 'intention', 'fact', 'context')),
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- ============================================
-- Vector embeddings table (sqlite-vec)
-- ============================================
CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
  embedding float[4096]
);

-- ============================================
-- Tasks table
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ready', 'done', 'running', 'failed')),
  result TEXT,
  run_at DATETIME,
  is_auto INTEGER DEFAULT 0,
  repeat_interval INTEGER DEFAULT NULL,
  cron_expression TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Default global session for cross-session memory
-- ============================================
INSERT OR IGNORE INTO sessions (id, agent_id) VALUES ('global', 'main_agent');