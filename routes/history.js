/*
 * routes/history.js
 * ------------------------------------------------------------------
 * Feeds the dashboard's Chart.js trend graphs (24h/7d heart rate,
 * SpO2, temperature) and the Leaflet map's location history trail.
 * ------------------------------------------------------------------
 */
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

function rangeToSqliteModifier(range) {
  return range === '7d' ? '-7 days' : '-1 day'; // default 24h
}

router.get('/vitals/:childId', (req, res) => {
  const modifier = rangeToSqliteModifier(req.query.range);
  const rows = db
    .prepare(
      `SELECT heart_rate, spo2, temperature, timestamp FROM health_vitals
       WHERE child_id = ? AND timestamp >= datetime('now', ?)
       ORDER BY timestamp ASC`
    )
    .all(req.params.childId, modifier);
  res.json(rows);
});

router.get('/location/:childId', (req, res) => {
  const modifier = rangeToSqliteModifier(req.query.range);
  const rows = db
    .prepare(
      `SELECT latitude, longitude, moving, timestamp FROM gps_logs
       WHERE child_id = ? AND timestamp >= datetime('now', ?)
       ORDER BY timestamp ASC`
    )
    .all(req.params.childId, modifier);
  res.json(rows);
});

module.exports = router;
