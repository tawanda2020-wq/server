-- schema.sql
-- Six core tables from the technical guide, plus two small additions
-- (device_commands, zone_groups/zone_group_members) needed to support
-- the multi-stop geofence journeys and the request/response command
-- channel described in docs/DEPLOYMENT_GUIDE.md.

CREATE TABLE IF NOT EXISTS children (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  dob           TEXT,
  parent_phone  TEXT NOT NULL,          -- E.164 format, e.g. +263771234567
  device_mac    TEXT UNIQUE,            -- matches DEVICE_ID in firmware config.h; NULL = unassigned
  photo_path    TEXT,
  active_zone_group_id TEXT,            -- FK-ish reference into data/zones.json groups
  active_zone_stop_index INTEGER DEFAULT 0,
  active_zone_stop_started_at TEXT,      -- when the current stop began, for journey advancement
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gps_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id    INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  latitude    REAL NOT NULL,
  longitude   REAL NOT NULL,
  moving      INTEGER DEFAULT 0,
  timestamp   TEXT DEFAULT (datetime('now')),
  synced      INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS health_vitals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id      INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  heart_rate    INTEGER,
  spo2          INTEGER,
  temperature   REAL,
  timestamp     TEXT DEFAULT (datetime('now')),
  synced        INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS geofence_zones (
  id          TEXT PRIMARY KEY,     -- matches the pool id in data/zones.json
  child_id    INTEGER REFERENCES children(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  lat_center  REAL NOT NULL,
  lng_center  REAL NOT NULL,
  radius_m    REAL NOT NULL,
  active      INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS alerts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id       INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  type           TEXT NOT NULL,      -- geofence_breach | fall | sos | high_temp | low_temp | low_battery
  message        TEXT NOT NULL,
  latitude       REAL,
  longitude      REAL,
  zone_name      TEXT,
  timestamp      TEXT DEFAULT (datetime('now')),
  acknowledged   INTEGER DEFAULT 0,
  sms_sent       INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS offline_buffer (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id      INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  payload_json  TEXT NOT NULL,
  recorded_at   TEXT,
  uploaded_at   TEXT DEFAULT (datetime('now'))
);

-- Pending one-shot commands for a device, consumed on its next telemetry
-- POST (see services/commandQueue.js). This is what lets the dashboard
-- "reach" the device without either side needing to know an IP.
CREATE TABLE IF NOT EXISTS device_commands (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  device_mac  TEXT NOT NULL,
  type        TEXT NOT NULL,     -- send_sms | sos_ack | fall_ack | breach_demo
  message     TEXT,
  phone       TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  consumed    INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_gps_logs_child ON gps_logs(child_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_health_vitals_child ON health_vitals(child_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_alerts_child ON alerts(child_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_device_commands_pending ON device_commands(device_mac, consumed);
