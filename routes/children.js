/*
 * routes/children.js
 * ------------------------------------------------------------------
 * Child profile CRUD + the "only one physical tracker" assignment
 * rule: a device_mac can only be attached to ONE child at a time.
 * Registering a new child with the same device_mac an existing child
 * is using is rejected until that existing child profile is deleted.
 * ------------------------------------------------------------------
 */
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const requireAuth = require('../middleware/requireAuth');
const geofenceEngine = require('../services/geofenceEngine');
const thresholds = require('../services/thresholds');
const commandQueue = require('../services/commandQueue');   

router.use(requireAuth);

function latestFor(table, column, childId) {
  return db
    .prepare(`SELECT * FROM ${table} WHERE child_id = ? ORDER BY id DESC LIMIT 1`)
    .get(childId);
}

router.get('/', (req, res) => {
  const children = db.prepare(`SELECT * FROM children ORDER BY created_at DESC`).all();

  const enriched = children.map(child => {
    const vitals = latestFor('health_vitals', 'child_id', child.id);
    const gps = latestFor('gps_logs', 'child_id', child.id);
    const currentZone = geofenceEngine.resolveCurrentZoneForChild(db, child);
    return {
      ...child,
      latestVitals: vitals || null,
      latestLocation: gps || null,
      currentZone,
      online: !!(gps && Date.now() - new Date(gps.timestamp + 'Z').getTime() < thresholds.DEVICE_STALE_AFTER_MS),
    };
  });

  res.json(enriched);
});

router.post('/', (req, res) => {
  const { name, dob, parentPhone, deviceMac } = req.body;
  if (!name || !parentPhone) {
    return res.status(400).json({ error: 'name and parentPhone are required' });
  }

  if (deviceMac) {
    const existing = db
      .prepare(`SELECT id, name FROM children WHERE device_mac = ?`)
      .get(deviceMac);
    if (existing) {
      return res.status(409).json({
        error: `Tracker "${deviceMac}" is already assigned to ${existing.name}. Delete that profile first to reassign it.`,
      });
    }
  }

  const info = db
    .prepare(
      `INSERT INTO children (name, dob, parent_phone, device_mac) VALUES (?, ?, ?, ?)`
    )
    .run(name, dob || null, parentPhone, deviceMac || null);

  const child = db.prepare(`SELECT * FROM children WHERE id = ?`).get(info.lastInsertRowid);

  if (child.device_mac) {                                                          
    commandQueue.enqueueCommand(                                                   
      db, child.device_mac, 'child_linked',                                        
      `${child.name} is now linked to this tracker.`                               
    );                                                                             
  }                                                                                

  res.status(201).json(child);
});

router.delete('/:id', (req, res) => {
  const child = db.prepare(`SELECT * FROM children WHERE id = ?`).get(req.params.id);
  db.prepare(`DELETE FROM children WHERE id = ?`).run(req.params.id);

  if (child && child.device_mac) {
    commandQueue.enqueueCommand(
      db, child.device_mac, 'child_unlinked',
      `${child.name} was removed from this tracker.`
    );
  }

  res.json({ ok: true });
});

module.exports = router;
