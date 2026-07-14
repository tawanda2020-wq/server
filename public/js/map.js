/*
 * map.js -- Leaflet map(s): a small "mini map" on the Overview tab and
 * the full live map on the Map tab. Both show the child's live marker
 * and the current geofence zone as a circle
 * the live map also draws
 * a short recent-history trail, plus persistent breach markers that
 * stay until the parent acknowledges the alert (not on a timer).
 */

let liveMap, liveMarker, liveZoneCircle, liveTrailLine;
let miniMap, miniMarker, miniZoneCircle;
let lastKnownZone = null;          // never cleared by a transient null -- only replaced by a new real zone
let lastKnownLatLng = null;
const breachMarkersByAlertId = {}; // alertId -> Leaflet marker, removed only on acknowledgement

const HARARE_DEFAULT = [-17.8216, 31.0492];

function initMaps() {
  liveMap = L.map('liveMap').setView(HARARE_DEFAULT, 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(liveMap);

  miniMap = L.map('ovMiniMap', { zoomControl: false, attributionControl: false }).setView(HARARE_DEFAULT, 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(miniMap);
}

// Client-side-only distance helper, used purely to explain status to the
// parent in map popups/panels -- this is informational dashboard UI, not
// the SMS copy (which stays plain-English per the project's requirement).
function distanceMetersClient(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function popupHtmlFor(latlng, zone) {
  const [lat, lng] = latlng;
  let statusLine = 'No geofence plan assigned yet.';
  if (zone) {
    const dist = distanceMetersClient(lat, lng, zone.centerLat, zone.centerLng);
    const inside = dist <= zone.radiusM;
    statusLine = inside
      ? `<span style="color:#4fae8e;font-weight:600;">Inside "${escapeHtml(zone.name)}"</span> (${Math.round(dist)}m from center)`
      : `<span style="color:#f0575a;font-weight:600;">Outside "${escapeHtml(zone.name)}"</span> (${Math.round(dist)}m from center, zone radius ${zone.radiusM}m)`;
  }
  return `
    <div style="min-width:180px;">
      <strong>Last known position</strong><br>
      Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}<br>
      ${statusLine}
    </div>`;
}

function upsertMarker(mapRef, markerRef, latlng) {
  if (!markerRef) {
    markerRef = L.marker(latlng).addTo(mapRef);
  } else {
    markerRef.setLatLng(latlng);
  }
  markerRef.bindPopup(popupHtmlFor(latlng, lastKnownZone));
  return markerRef;
}

function upsertZoneCircle(mapRef, circleRef, zone) {
  // IMPORTANT: never remove an existing circle just because a single
  // update happened to arrive with a null/missing zone -- only replace
  // it when we actually have a new zone to show. This is what keeps the
  // zone marking from "disappearing" while the child is moving around.
  if (!zone) return circleRef;

  const latlng = [zone.centerLat, zone.centerLng];
  if (!circleRef) {
    circleRef = L.circle(latlng, {
      radius: zone.radiusM,
      color: '#8a6fd1',
      fillColor: '#b9a4ec',
      fillOpacity: 0.25,
    }).addTo(mapRef);
  } else {
    circleRef.setLatLng(latlng);
    circleRef.setRadius(zone.radiusM);
  }
  circleRef.bindTooltip(zone.name, { permanent: false });
  return circleRef;
}

function updateMapsWithTelemetry(detail) {
  if (detail.childId !== AppState.currentChildId) return;
  const latlng = [detail.gps.lat, detail.gps.lng];

  if (detail.currentZone) lastKnownZone = detail.currentZone;
  lastKnownLatLng = latlng;

  liveMarker = upsertMarker(liveMap, liveMarker, latlng);
  liveZoneCircle = upsertZoneCircle(liveMap, liveZoneCircle, detail.currentZone);
  liveMap.panTo(latlng, { animate: true });

  miniMarker = upsertMarker(miniMap, miniMarker, latlng);
  miniZoneCircle = upsertZoneCircle(miniMap, miniZoneCircle, detail.currentZone);
  miniMap.panTo(latlng, { animate: true });

  renderMapGeofencePanel();
}

async function loadLocationHistory(childId) {
  if (!liveMap) return;
  try {
    const rows = await Api.get(`/api/history/location/${childId}?range=24h`);
    if (liveTrailLine) { liveMap.removeLayer(liveTrailLine); liveTrailLine = null; }
    if (!rows || rows.length === 0) return;
    const latlngs = rows.map(r => [r.latitude, r.longitude]);
    liveTrailLine = L.polyline(latlngs, { color: '#ec6a9c', weight: 3, opacity: 0.6 }).addTo(liveMap);
    const last = rows[rows.length - 1];
    liveMap.setView([last.latitude, last.longitude], 15);
  } catch (e) { /* no history yet, fine */ }
}

// Breach markers persist until the parent acknowledges the alert --
// they are NOT removed on a timer, per the requirement that the map
// should keep showing "something worth looking at" until acknowledged.
function markBreachOnMap(detail) {
  if (detail.childId !== AppState.currentChildId) return;
  const latlng = [detail.location.lat, detail.location.lng];
  const marker = L.marker(latlng, {
    icon: L.divIcon({ className: '', html: '<div style="font-size:30px;">🚨</div>', iconSize: [30, 30] }),
  }).addTo(liveMap).bindPopup(`<strong style="color:#c0392b;">BREACH</strong><br>Left "${escapeHtml(detail.zoneName)}"<br>Awaiting acknowledgement`).openPopup();
  liveMap.panTo(latlng);

  if (detail.alertId) {
    breachMarkersByAlertId[detail.alertId] = marker;
  }
}

function clearBreachMarkerForAlert(alertId) {
  const marker = breachMarkersByAlertId[alertId];
  if (marker) {
    liveMap.removeLayer(marker);
    delete breachMarkersByAlertId[alertId];
  }
}

// ---- Map tab's Geofence explanation panel ----
function renderMapGeofencePanel() {
  const box = document.getElementById('mapGeofenceStatus');
  if (!box) return;
  const child = getCurrentChild();

  if (!lastKnownZone) {
    box.innerHTML = `<p class="text-muted small mb-0">No geofence plan assigned yet. Go to the <strong>Geofence</strong> tab to choose one -- until then, the map can't tell you whether ${child ? escapeHtml(child.name) : 'the child'} is somewhere expected.</p>`;
    return;
  }

  let statusHtml = '';
  if (lastKnownLatLng) {
    const dist = distanceMetersClient(lastKnownLatLng[0], lastKnownLatLng[1], lastKnownZone.centerLat, lastKnownZone.centerLng);
    const inside = dist <= lastKnownZone.radiusM;
    statusHtml = inside
      ? `<span class="text-success fw-bold">Currently inside the zone</span> -- everything looks normal.`
      : `<span class="text-danger fw-bold">Currently outside the zone</span> -- this is what triggers a breach alert.`;
  }

  box.innerHTML = `
    <p class="small mb-1"><strong>Expected place:</strong> ${escapeHtml(lastKnownZone.name)} (a ${lastKnownZone.radiusM}m circle shown in purple on the map).</p>
    <p class="small mb-1">${statusHtml}</p>
    <p class="small text-muted mb-0">The purple circle is the "safe area" you set in the Geofence tab. The pin is the tracker's last reported position. If the pin is ever reported outside every circle assigned to this child, the system raises a Zone Breach alert automatically (or you can try it yourself with the panel on the right).</p>
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  initMaps();
});
document.addEventListener('telemetry:update', (e) => updateMapsWithTelemetry(e.detail));
document.addEventListener('geofence:breach', (e) => markBreachOnMap(e.detail));
document.addEventListener('alert:ack', (e) => clearBreachMarkerForAlert(e.detail.id));
document.addEventListener('child:switched', () => {
  lastKnownZone = null;
  lastKnownLatLng = null;
  loadLocationHistory(AppState.currentChildId);
  renderMapGeofencePanel();
});
document.addEventListener('children:loaded', () => {
  if (AppState.currentChildId) loadLocationHistory(AppState.currentChildId);
});

