/*
 * services/geofenceEngine.js
 * ------------------------------------------------------------------
 * Everything related to the pool of designated zones, resolving a
 * child's CURRENT active zone (advancing multi-stop journeys over
 * time), and checking whether a coordinate is inside/outside a zone.
 *
 * Distance math (Haversine) is used internally only -- per the
 * project's explicit instruction, it is never surfaced in SMS text
 * or dashboard copy shown to the parent. It's just the "is this point
 * inside this circle" calculation.
 * ------------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');
const thresholds = require('./thresholds');

const zonesData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'zones.json'), 'utf8')
);

function getZonePool() {
  return zonesData.zonePool;
}

function getZoneGroups() {
  return zonesData.zoneGroups;
}

function getBreachLocations() {
  return zonesData.breachDemoLocations;
}

function resolveZoneById(zoneId) {
  return zonesData.zonePool.find(z => z.id === zoneId) || null;
}

function resolveGroupById(groupId) {
  return zonesData.zoneGroups.find(g => g.id === groupId) || null;
}

// Internal-only distance helper (Haversine). Not exposed in any
// parent-facing text.
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isInsideZone(lat, lng, zone) {
  if (!zone) return false;
  return distanceMeters(lat, lng, zone.lat, zone.lng) <= zone.radiusM;
}

/**
 * Given a child row from the DB, figures out which single zone is
 * "currently active" for the GPS simulator, advancing multi-stop
 * journeys automatically based on elapsed time. Mutates the child's
 * stop index/timestamp in the DB if it's time to advance.
 *
 * Returns { id, name, centerLat, centerLng, radiusM } shaped exactly
 * as the ESP32 firmware's GeoZone struct expects, or null if the
 * child has no zone group assigned yet.
 */
function resolveCurrentZoneForChild(db, child) {
  if (!child.active_zone_group_id) return null;

  const group = resolveGroupById(child.active_zone_group_id);
  if (!group || !group.stops || group.stops.length === 0) return null;

  let stopIndex = child.active_zone_stop_index || 0;
  let stopStartedAt = child.active_zone_stop_started_at
    ? new Date(child.active_zone_stop_started_at).getTime()
    : Date.now();

  const now = Date.now();
  let advanced = false;

  if (now - stopStartedAt >= thresholds.JOURNEY_STOP_DURATION_MS) {
    stopIndex = (stopIndex + 1) % group.stops.length;
    stopStartedAt = now;
    advanced = true;
  }

  if (advanced) {
    db.prepare(
      `UPDATE children
       SET active_zone_stop_index = ?, active_zone_stop_started_at = ?
       WHERE id = ?`
    ).run(stopIndex, new Date(stopStartedAt).toISOString(), child.id);
  }

  const zoneId = group.stops[stopIndex];
  const zone = resolveZoneById(zoneId);
  if (!zone) return null;

  return {
    id: zone.id,
    name: zone.name,
    centerLat: zone.lat,
    centerLng: zone.lng,
    radiusM: zone.radiusM,
  };
}

/**
 * Checks whether a given lat/lng is inside ANY zone belonging to the
 * child's currently assigned group (used by the breach-demo endpoint,
 * which is intentionally more lenient than "must be in the one exact
 * current stop" -- a real GPS reading anywhere in today's set of
 * allowed places should NOT count as a breach).
 */
function isChildWithinAssignedZones(child, lat, lng) {
  if (!child.active_zone_group_id) return { withinAny: false, checkedZoneNames: [] };

  const group = resolveGroupById(child.active_zone_group_id);
  if (!group) return { withinAny: false, checkedZoneNames: [] };

  const uniqueStopIds = [...new Set(group.stops)];
  const zones = uniqueStopIds.map(resolveZoneById).filter(Boolean);

  const withinAny = zones.some(z => isInsideZone(lat, lng, z));
  return { withinAny, checkedZoneNames: zones.map(z => z.name) };
}

module.exports = {
  getZonePool,
  getZoneGroups,
  getBreachLocations,
  resolveZoneById,
  resolveGroupById,
  isInsideZone,
  resolveCurrentZoneForChild,
  isChildWithinAssignedZones,
};
