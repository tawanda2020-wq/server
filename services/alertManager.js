/*
 * services/alertManager.js
 * ------------------------------------------------------------------
 * Central place that decides "should this actually become an alert +
 * SMS right now, or are we still in a cooldown window / is this event
 * already active and already notified?" Every alert-producing code
 * path (telemetry route, breach-demo route) goes through here so the
 * anti-spam rule lives in exactly one place.
 *
 * Cooldown timing is tracked in an IN-MEMORY map (lastFiredAtMs),
 * not by re-parsing a stored DB timestamp. This avoids any ambiguity
 * from date-string formats/timezones, and means the cooldown clock
 * for a given child+type is authoritative for as long as this server
 * process has been running. NOTE: this resets if the process
 * restarts (e.g. a free-tier host recycling the instance) -- for a
 * production deployment, run on a host that doesn't restart randomly
 * (or persist SQLite on a real disk, see docs/DEPLOYMENT_GUIDE.md).
 *
 * SMS copy is deliberately plain-English: zone name, event type, and
 * a coordinate -- no distance-formula jargon, per the project's
 * explicit instruction.
 * ------------------------------------------------------------------
 */
const thresholds = require('./thresholds');
const commandQueue = require('./commandQueue');

const COOLDOWN_MS_BY_TYPE = {
  geofence_breach: thresholds.SMS_COOLDOWN_GEOFENCE_MS,
  high_temp: thresholds.SMS_COOLDOWN_TEMP_MS,
  low_temp: thresholds.SMS_COOLDOWN_TEMP_MS,
  low_battery: thresholds.SMS_COOLDOWN_BATTERY_MS,
};

// key: `${childId}:${type}` -> last-fired epoch ms (this process only)
const lastFiredAtMs = new Map();

function isOneShotType(type) {
  return type === 'fall' || type === 'sos';
}

function buildSmsText(type, childName, zoneName, lat, lng) {
  const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  switch (type) {
    case 'geofence_breach':
      return `Alert: ${childName} has left the "${zoneName}" zone. Last known spot: ${coords}. Check the dashboard for details.`;
    case 'fall':
      return `Alert: possible FALL detected for ${childName} near "${zoneName}". Location: ${coords}. Please check the dashboard.`;
    case 'sos':
      return `EMERGENCY: ${childName} pressed the SOS button near "${zoneName}". Location: ${coords}. Please check the dashboard immediately.`;
    case 'high_temp':
      return `Alert: ${childName}'s temperature reading is high. Please check the dashboard.`;
    case 'low_temp':
      return `Alert: ${childName}'s temperature reading is low. Please check the dashboard.`;
    case 'low_battery':
      return `Notice: ${childName}'s tracker battery is low. Please charge it soon.`;
    default:
      return `Alert for ${childName}. Please check the dashboard.`;
  }
}

function raiseAlert(db, io, child, type, zoneName, lat, lng, opts = {}) {
  const now = Date.now();
  const force = !!opts.force;

  if (isOneShotType(type)) {
    const active = db
      .prepare(
        `SELECT id FROM alerts WHERE child_id = ? AND type = ? AND acknowledged = 0
         ORDER BY id DESC LIMIT 1`
      )
      .get(child.id, type);
    if (active && !force) return null;
  } else if (!force) {
    const cooldownMs = COOLDOWN_MS_BY_TYPE[type] || 0;
    const mapKey = `${child.id}:${type}`;
    const lastFired = lastFiredAtMs.get(mapKey);
    if (lastFired && now - lastFired < cooldownMs) {
      return null;
    }
  }

  const message = buildSmsText(type, child.name, zoneName, lat, lng);

  const info = db
    .prepare(
      `INSERT INTO alerts (child_id, type, message, latitude, longitude, zone_name, sms_sent)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    )
    .run(child.id, type, message, lat, lng, zoneName);

  lastFiredAtMs.set(`${child.id}:${type}`, now);

  commandQueue.enqueueCommand(db, child.device_mac, 'send_sms', message, child.parent_phone);

  const alertRow = db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(info.lastInsertRowid);

  if (io) {
    io.emit('alert:new', { ...alertRow, childName: child.name });
  }

  return alertRow;
}

function acknowledgeAlert(db, io, alertId) {
  db.prepare(`UPDATE alerts SET acknowledged = 1 WHERE id = ?`).run(alertId);
  const alert = db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(alertId);
  if (alert && io) {
    io.emit('alert:ack', { id: alertId, childId: alert.child_id, type: alert.type });
  }
  return alert;
}

module.exports = { raiseAlert, acknowledgeAlert, buildSmsText };

