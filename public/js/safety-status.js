/*
 * safety-status.js -- drives the "Child Safety Status" chips at the
 * top of the Overview tab: Location (inside/outside zone), Health
 * (normal/alert), Emergency (none/active).
 */

function setChip(chipId, valueId, text, status) {
  const chip = document.getElementById(chipId);
  const val = document.getElementById(valueId);
  if (!chip || !val) return;
  chip.classList.remove('status-good', 'status-warning', 'status-danger');
  if (status) chip.classList.add(status);
  val.textContent = text;
}

let lastAlertRowsCache = [];

function updateSafetyStatusChips(alertRows) {
  if (alertRows) lastAlertRowsCache = alertRows;
  const rows = lastAlertRowsCache;
  const child = getCurrentChild();
  if (!child) return;

  const activeEmergency = rows.find(
    a => !a.acknowledged && ['sos', 'fall', 'geofence_breach'].includes(a.type)
  );
  if (activeEmergency) {
    const label = activeEmergency.type === 'sos' ? 'SOS Active'
      : activeEmergency.type === 'fall' ? 'Fall Active'
      : 'Zone Breach';
    setChip('safetyEmergencyChip', 'safetyEmergencyValue', label, 'status-danger');
  } else {
    setChip('safetyEmergencyChip', 'safetyEmergencyValue', 'None -- all clear', 'status-good');
  }

  const activeHealthAlert = rows.find(
    a => !a.acknowledged && ['high_temp', 'low_temp'].includes(a.type)
  );
  if (activeHealthAlert) {
    setChip('safetyHealthChip', 'safetyHealthValue', 'Needs attention', 'status-danger');
  } else {
    setChip('safetyHealthChip', 'safetyHealthValue', 'Normal', 'status-good');
  }

  if (typeof lastKnownZone !== 'undefined' && lastKnownZone && typeof lastKnownLatLng !== 'undefined' && lastKnownLatLng) {
    const dist = distanceMetersClient(lastKnownLatLng[0], lastKnownLatLng[1], lastKnownZone.centerLat, lastKnownZone.centerLng);
    const inside = dist <= lastKnownZone.radiusM;
    setChip('safetyZoneChip', 'safetyZoneValue', inside ? `Safe -- ${lastKnownZone.name}` : 'Outside zone', inside ? 'status-good' : 'status-danger');
  } else {
    setChip('safetyZoneChip', 'safetyZoneValue', 'No zone set', 'status-warning');
  }
}

document.addEventListener('telemetry:update', (e) => {
  if (e.detail.childId === AppState.currentChildId) {
    updateSafetyStatusChips(null);
  }
});


