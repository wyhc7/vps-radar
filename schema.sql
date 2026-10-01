-- vps-radar D1 schema
CREATE TABLE IF NOT EXISTS servers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  token       TEXT NOT NULL,
  os          TEXT NOT NULL DEFAULT '',
  ip          TEXT NOT NULL DEFAULT '',
  price       TEXT NOT NULL DEFAULT '',   -- 自由文本，如 "¥299/年"
  expire_at   INTEGER NOT NULL DEFAULT 0, -- 到期时间戳，0 = 未设置
  alert_offline INTEGER NOT NULL DEFAULT 0,
  notified_7d INTEGER NOT NULL DEFAULT 0,
  notified_3d INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS metrics (
  server_id  TEXT NOT NULL,
  ts         INTEGER NOT NULL,
  cpu        REAL NOT NULL DEFAULT 0,
  load1      REAL NOT NULL DEFAULT 0,
  mem_total  INTEGER NOT NULL DEFAULT 0,
  mem_used   INTEGER NOT NULL DEFAULT 0,
  swap_total INTEGER NOT NULL DEFAULT 0,
  swap_used  INTEGER NOT NULL DEFAULT 0,
  disk_total INTEGER NOT NULL DEFAULT 0,
  disk_used  INTEGER NOT NULL DEFAULT 0,
  net_rx     REAL NOT NULL DEFAULT 0,  -- bytes/s
  net_tx     REAL NOT NULL DEFAULT 0,
  uptime     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (server_id, ts)
);

-- 每台机器的最新状态（上报时 upsert，仪表盘直接读这张表）
CREATE TABLE IF NOT EXISTS latest (
  server_id TEXT PRIMARY KEY,
  ts        INTEGER NOT NULL,
  cpu       REAL NOT NULL DEFAULT 0,
  load1     REAL NOT NULL DEFAULT 0,
  mem_total INTEGER NOT NULL DEFAULT 0,
  mem_used  INTEGER NOT NULL DEFAULT 0,
  swap_total INTEGER NOT NULL DEFAULT 0,
  swap_used INTEGER NOT NULL DEFAULT 0,
  disk_total INTEGER NOT NULL DEFAULT 0,
  disk_used INTEGER NOT NULL DEFAULT 0,
  net_rx    REAL NOT NULL DEFAULT 0,
  net_tx    REAL NOT NULL DEFAULT 0,
  uptime    INTEGER NOT NULL DEFAULT 0,
  net_rx_total INTEGER NOT NULL DEFAULT 0,
  net_tx_total INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_metrics_ts ON metrics (ts);
