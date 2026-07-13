/*
 * routes/alerts.js
 * ------------------------------------------------------------------
 * Alert history listing + parent acknowledgement (used for SOS and
 * fall events -- acknowledging queues a "sos_ack"/"fall_ack" command
 * for the device so it can stop its alert screen/blinking and give
 * the child haptic-equivalent buzzer+LED confirmation feedback).
 * ------------------------------------------------------------------
 */
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const requireAuth = require('../middleware/requireAuth');
const alertManager = require('../services/alertManager');
const commandQueue = require('../services/commandQueue');

router.use(requireAuth);

router.get('/', (req, res) => {
  const { childId, limit } = req.query;
  let rows;
  if (childId) {
    rows = db
      .prepare(`SELECT * FROM alerts WHERE child_id = ? ORDER BY id DESC LIMIT ?`)
      .all(childId, Number(limit) || 100);
  } else {
    rows = db.prepare(`SELECT * FROM alerts ORDER BY id DESC LIMIT ?`).all(Number(limit) || 100);
  }
  res.json(rows);
});

router.post('/:id/ack', (req, res) => {
  const io = req.app.get('io');
  const alertId = req.params.id;

  const alert = db.prepare(`SELECT * FROM alerts WHERE id = ?`).get(alertId);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  const updated = alertManager.acknowledgeAlert(db, io, alertId);

  const child = db.prepare(`SELECT * FROM children WHERE id = ?`).get(alert.child_id);
  if (child && child.device_mac) {
    if (alert.type === 'sos') {
      commandQueue.enqueueCommand(db, child.device_mac, 'sos_ack');
    } else if (alert.type === 'fall') {
      commandQueue.enqueueCommand(db, child.device_mac, 'fall_ack');
    } else if (alert.type === 'geofence_breach') {
      commandQueue.enqueueCommand(db, child.device_mac, 'breach_ack');
    }
  }

  res.json({ ok: true, alert: updated });
});

module.exports = router;
