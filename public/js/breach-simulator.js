/*
 * breach-simulator.js -- the stacked/collapsible panel on the Map tab
 * that lets the parent pick a preset "outside the zone" location and
 * submit it, triggering the full breach alert flow (map, alert log,
 * database, SMS to parent) without physically moving the tracker.
 */

async function loadBreachLocations() {
  const rows = await Api.get('/api/geofence/breach-locations');
  if (!rows) return;
  AppState.breachLocations = rows;
  const sel = document.getElementById('breachLocationSelect');
  sel.innerHTML = rows.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
}

document.getElementById('breachToggle').addEventListener('click', () => {
  const body = document.getElementById('breachBody');
  body.classList.toggle('d-none');
});

document.getElementById('breachSubmitBtn').addEventListener('click', async () => {
  const resultBox = document.getElementById('breachResult');
  resultBox.textContent = '';
  if (!AppState.currentChildId) {
    resultBox.innerHTML = '<span class="text-danger">Select a child first.</span>';
    return;
  }
  const locationId = document.getElementById('breachLocationSelect').value;
  try {
    const res = await Api.post('/api/geofence/breach-demo', {
      childId: AppState.currentChildId,
      locationId,
    });
    resultBox.innerHTML = res.smsQueued
      ? '<span class="text-success">Breach triggered -- SMS queued to parent phone, dashboard updated.</span>'
      : '<span class="text-muted">Breach logged (SMS suppressed by anti-spam cooldown -- still updated on the map/alerts).</span>';
    await loadAlerts();
  } catch (err) {
    resultBox.innerHTML = `<span class="text-danger">${escapeHtml(err.message)}</span>`;
  }
});

document.addEventListener('DOMContentLoaded', loadBreachLocations);
