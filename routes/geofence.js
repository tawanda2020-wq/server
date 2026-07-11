/*
 * routes/geofence.js
 * ------------------------------------------------------------------
 * - GET /api/geofence/pool          -> the designated zones + groups a
 *                                      parent can pick from
 * - GET /api/geofence/breach-locations -> preset "outside" points for
 *                                      the dashboard's Simulate Breach panel
 * - POST /api/geofence/assign       -> assign a zone group to a child
 * - POST /api/geofence/breach-demo  -> trigger the out-of-zone demo flow
 * ------------------------------------------------------------------
 */
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const requireAuth = require('../middleware/requireAuth');
const geofenceEngine = require('../services/geofenceEngine');
const alertManager = require('../services/alertManager');
const commandQueue = require('../services/commandQueue');

router.use(requireAuth);

router.get('/pool', (req, res) => {
  res.json({
    zonePool: geofenceEngine.getZonePool(),
    zoneGroups: geofenceEngine.getZoneGroups(),
  });
});

router.get('/breach-locations', (req, res) => {
  res.json(geofenceEngine.getBreachLocations());
});

router.post('/assign', (req, res) => {
  const { childId, zoneGroupId } = req.body;
  const group = geofenceEngine.resolveGroupById(zoneGroupId);
  if (!group) return res.status(400).json({ error: 'Unknown zone group id' });

  db.prepare(
    `UPDATE children
     SET active_zone_group_id = ?, active_zone_stop_index = 0, active_zone_stop_started_at = ?
     WHERE id = ?`
  ).run(zoneGroupId, new Date().toISOString(), childId);

  const child = db.prepare(`SELECT * FROM children WHERE id = ?`).get(childId);
  const currentZone = geofenceEngine.resolveCurrentZoneForChild(db, child);
  res.json({ ok: true, group, currentZone });
});

/**
 * Demo-only endpoint: the parent picks a preset "outside" location from
 * the dashboard's Simulate Breach panel. We confirm it's genuinely
 * outside every zone in the child's current assignment, raise the
 * geofence_breach alert (with cooldown/anti-spam via alertManager),
 * and queue a "breach_demo" display command PLUS the SMS command so
 * the physical device shows the alert screen and sends a real SMS.
 */
router.post('/breach-demo', (req, res) => {
  const io = req.app.get('io');
  const { childId, locationId } = req.body;

  const child = db.prepare(`SELECT * FROM children WHERE id = ?`).get(childId);
  if (!child) return res.status(404).json({ error: 'Child not found' });
  if (!child.device_mac) return res.status(400).json({ error: 'Child has no tracker assigned' });

  const location = geofenceEngine
    .getBreachLocations()
    .find(l => l.id === locationId);
  if (!location) return res.status(400).json({ error: 'Unknown breach demo location' });

  const { withinAny, checkedZoneNames } = geofenceEngine.isChildWithinAssignedZones(
    child,
    location.lat,
    location.lng
  );

  if (withinAny) {
    return res.status(400).json({ error: 'That location is actually inside the current zone(s), pick another.' });
  }

  const currentZone = geofenceEngine.resolveCurrentZoneForChild(db, child);
  const zoneName = currentZone ? currentZone.name : (checkedZoneNames[0] || 'assigned zone');

  const alert = alertManager.raiseAlert(
    db, io, child, 'geofence_breach', zoneName, location.lat, location.lng
  );

  commandQueue.enqueueCommand(db, child.device_mac, 'breach_demo', zoneName, '');

  if (io) {
    io.emit('geofence:breach', {
      childId: child.id,
      childName: child.name,
      location,
      zoneName,
      timestamp: new Date().toISOString(),
    });
  }

  db.prepare(
    `INSERT INTO gps_logs (child_id, latitude, longitude, moving) VALUES (?, ?, ?, 1)`
  ).run(child.id, location.lat, location.lng);

  res.json({ ok: true, alert, smsQueued: !!alert });
});

module.exports = router;
