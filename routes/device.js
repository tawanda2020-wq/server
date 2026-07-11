/*
 * routes/device.js
 * ------------------------------------------------------------------
 * POST /api/device/telemetry
 *
 * This is the ONE endpoint the ESP32 firmware ever calls. Every cycle
 * it sends everything it knows (simulated GPS, vitals, battery, fall
 * state, SOS state); the server:
 *   1. Persists GPS + vitals to SQLite.
 *   2. Evaluates temperature + battery thresholds and raises alerts
 *      (with cooldown) via alertManager.
 *   3. Reacts to fall/SOS state transitions the SAME way (one-shot).
 *   4. Resolves the child's current geofence zone (advancing
 *      multi-stop journeys as needed) to hand back to the device.
 *   5. Drains any pending dashboard-triggered commands (send_sms,
 *      sos_ack, fall_ack, breach_demo) for this device.
 *   6. Pushes a live update to any connected dashboard browsers via
 *      Socket.io.
 * ------------------------------------------------------------------
 */
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const requireDevice = require('../middleware/requireDevice');
const geofenceEngine = require('../services/geofenceEngine');
const alertManager = require('../services/alertManager');
const commandQueue = require('../services/commandQueue');
const thresholds = require('../services/thresholds');

// FallState enum values must match esp32-firmware/ChildTracker/fall_detection.h
const FALL_STATE_CONFIRMED = 2;

router.post('/telemetry', requireDevice, (req, res) => {
  const io = req.app.get('io');
  const deviceId = req.deviceId;
  const body = req.body || {};

  const child = db.prepare(`SELECT * FROM children WHERE device_mac = ?`).get(deviceId);
  if (!child) {
    return res.status(404).json({ error: `No child profile assigned to device "${deviceId}" yet.` });
  }

  const gps = body.gps || {};
  const vitals = body.vitals || {};
  const battery = body.battery || {};
  const fallState = typeof body.fallState === 'number' ? body.fallState : 0;
  const sosActive = !!body.sosActive;

  // --- persist raw readings ---
  if (typeof gps.lat === 'number' && typeof gps.lng === 'number') {
    db.prepare(
      `INSERT INTO gps_logs (child_id, latitude, longitude, moving) VALUES (?, ?, ?, ?)`
    ).run(child.id, gps.lat, gps.lng, gps.moving ? 1 : 0);
  }

  if (vitals && (vitals.heartRate || vitals.spo2 || typeof vitals.temperatureC === 'number')) {
    db.prepare(
      `INSERT INTO health_vitals (child_id, heart_rate, spo2, temperature) VALUES (?, ?, ?, ?)`
    ).run(
      child.id,
      vitals.heartRate || null,
      vitals.spo2 || null,
      vitals.temperatureC && vitals.temperatureC > -50 ? vitals.temperatureC : null
    );
  }

  // --- resolve current zone (advances journeys automatically) ---
  const currentZone = geofenceEngine.resolveCurrentZoneForChild(db, child);
  const zoneName = currentZone ? currentZone.name : 'unassigned zone';
  const lat = gps.lat, lng = gps.lng;

  // --- health threshold alerts (temperature only triggers active alerts,
  // per project scope -- HR/SpO2 are display-only) ---
  if (vitals.tempHighAlert) {
    alertManager.raiseAlert(db, io, child, 'high_temp', zoneName, lat, lng);
  } else if (vitals.tempLowAlert) {
    alertManager.raiseAlert(db, io, child, 'low_temp', zoneName, lat, lng);
  }

  // --- battery alert ---
  if (battery.lowAlert) {
    alertManager.raiseAlert(db, io, child, 'low_battery', zoneName, lat, lng);
  }

  // --- fall alert (one-shot per confirmed event) ---
  if (fallState === FALL_STATE_CONFIRMED) {
    alertManager.raiseAlert(db, io, child, 'fall', zoneName, lat, lng);
  }

  // --- SOS alert (one-shot per active event) ---
  if (sosActive) {
    alertManager.raiseAlert(db, io, child, 'sos', zoneName, lat, lng);
  }

  // --- live push to any open dashboards ---
  if (io) {
    io.emit('telemetry:update', {
      childId: child.id,
      childName: child.name,
      gps: { lat, lng, moving: !!gps.moving },
      vitals,
      battery,
      fallState,
      sosActive,
      currentZone,
      timestamp: new Date().toISOString(),
    });
  }

  // --- hand back current zone + any queued dashboard commands ---
  const commands = commandQueue.drainCommands(db, deviceId);

  res.json({
    ok: true,
    zone: currentZone
      ? {
          id: currentZone.id,
          name: currentZone.name,
          centerLat: currentZone.centerLat,
          centerLng: currentZone.centerLng,
          radiusM: currentZone.radiusM,
        }
      : null,
    commands,
  });
});

module.exports = router;
