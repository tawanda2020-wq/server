/*
 * services/commandQueue.js
 * ------------------------------------------------------------------
 * Pending one-shot commands for a specific device (identified by
 * device_mac / DEVICE_ID), consumed the next time that device POSTs
 * telemetry. This is the entire mechanism by which the dashboard
 * "reaches" the physical tracker without either side needing a
 * fixed IP or an open inbound port -- the device always initiates
 * the connection, the server just has something ready to hand back.
 * ------------------------------------------------------------------
 */

function enqueueCommand(db, deviceMac, type, message = '', phone = '') {
  db.prepare(
    `INSERT INTO device_commands (device_mac, type, message, phone) VALUES (?, ?, ?, ?)`
  ).run(deviceMac, type, message, phone);
}

/**
 * Pulls and marks-consumed all pending commands for a device, in
 * creation order. Called once per telemetry POST so the ESP32 gets
 * them in its response body.
 */
function drainCommands(db, deviceMac) {
  const rows = db
    .prepare(
      `SELECT id, type, message, phone FROM device_commands
       WHERE device_mac = ? AND consumed = 0
       ORDER BY id ASC LIMIT 5`
    )
    .all(deviceMac);

  if (rows.length > 0) {
    const ids = rows.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE device_commands SET consumed = 1 WHERE id IN (${placeholders})`).run(...ids);
  }

  return rows.map(r => ({ type: r.type, message: r.message || '', phone: r.phone || '' }));
}

module.exports = { enqueueCommand, drainCommands };
