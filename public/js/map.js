/*
 * map.js -- Leaflet map(s): a small "mini map" on the Overview tab and
 * the full live map on the Map tab. Both show the child's live marker
 * and the current geofence zone as a circle; the live map also draws
 * a short recent-history trail.
 */

let liveMap, liveMarker, liveZoneCircle, liveTrailLine;
let miniMap, miniMarker, miniZoneCircle;

const HARARE_DEFAULT = [-17.8216, 31.0492];

function initMaps() {
  liveMap = L.map('liveMap').setView(HARARE_DEFAULT, 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(liveMap);

  miniMap = L.map('ovMiniMap', { zoomControl: false, attributionControl: false }).setView(HARARE_DEFAULT, 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(miniMap);
}

function upsertMarker(mapRef, markerRef, latlng, popupText) {
  if (!markerRef) {
    markerRef = L.marker(latlng).addTo(mapRef);
  } else {
    markerRef.setLatLng(latlng);
  }
  if (popupText) markerRef.bindPopup(popupText);
  return markerRef;
}

function upsertZoneCircle(mapRef, circleRef, zone) {
  if (!zone) {
    if (circleRef) { mapRef.removeLayer(circleRef); }
    return null;
  }
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

  liveMarker = upsertMarker(liveMap, liveMarker, latlng, `${detail.childName} (last update)`);
  liveZoneCircle = upsertZoneCircle(liveMap, liveZoneCircle, detail.currentZone);
  liveMap.panTo(latlng, { animate: true });

  miniMarker = upsertMarker(miniMap, miniMarker, latlng);
  miniZoneCircle = upsertZoneCircle(miniMap, miniZoneCircle, detail.currentZone);
  miniMap.panTo(latlng, { animate: true });
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

function markBreachOnMap(detail) {
  if (detail.childId !== AppState.currentChildId) return;
  const latlng = [detail.location.lat, detail.location.lng];
  const marker = L.marker(latlng, {
    icon: L.divIcon({ className: '', html: '<div style="font-size:28px;">🚨</div>', iconSize: [28, 28] }),
  }).addTo(liveMap).bindPopup(`Breach: left "${detail.zoneName}"`).openPopup();
  liveMap.panTo(latlng);
  setTimeout(() => liveMap.removeLayer(marker), 12000);
}

document.addEventListener('DOMContentLoaded', () => {
  initMaps();
});
document.addEventListener('telemetry:update', (e) => updateMapsWithTelemetry(e.detail));
document.addEventListener('geofence:breach', (e) => markBreachOnMap(e.detail));
document.addEventListener('child:switched', () => loadLocationHistory(AppState.currentChildId));
document.addEventListener('children:loaded', () => {
  if (AppState.currentChildId) loadLocationHistory(AppState.currentChildId);
});
