/*
 * alerts.js -- alert log rendering (Overview "recent" + full Alerts
 * tab), acknowledgement actions, unread badge count, and the
 * full-screen emergency overlay for SOS/fall/geofence-breach events.
 * The overlay stays up until the parent explicitly acknowledges it --
 * it is never auto-dismissed by a timer or by new data arriving.
 */

const ALERT_TYPE_LABELS = {
  geofence_breach: 'Zone Breach',
  fall: 'Fall Detected',
  sos: 'SOS Emergency',
  high_temp: 'High Temperature',
  low_temp: 'Low Temperature',
  low_battery: 'Low Battery',
};

let unreadCount = 0;
let overlayActiveForAlertId = null;

function alertBadgeHtml(type) {
  return `<span class="alert-type-badge badge-${type}">${ALERT_TYPE_LABELS[type] || type}</span>`;
}

function renderAlertRow(a, includeAck) {
  const time = new Date(a.timestamp + 'Z').toLocaleString();
  const ackBtn = (includeAck && !a.acknowledged)
    ? `<button class="btn btn-sm btn-outline-secondary" data-ack="${a.id}">Acknowledge</button>`
    : (a.acknowledged ? '<span class="text-success small">acknowledged</span>' : '');
  return `
    <div class="alert-row">
      <div>
        ${alertBadgeHtml(a.type)}
        <div class="small mt-1">${escapeHtml(a.message)}</div>
        <div class="small text-muted">${time}</div>
      </div>
      <div>${ackBtn}</div>
    </div>`;
}

async function loadAlerts() {
  if (!AppState.currentChildId) return;
  const rows = await Api.get(`/api/alerts?childId=${AppState.currentChildId}&limit=200`);
  if (!rows) return;

  document.getElementById('alertsTable').innerHTML = rows.length
    ? rows.map(a => renderAlertRow(a, true)).join('')
    : '<p class="text-muted small">No alerts yet.</p>';

  document.getElementById('ovRecentAlerts').innerHTML = rows.length
    ? rows.slice(0, 5).map(a => renderAlertRow(a, true)).join('')
    : '<p class="text-muted small">No alerts yet.</p>';

  wireAckButtons();
  updateSafetyStatusChips(rows);
}

function wireAckButtons() {
  document.querySelectorAll('[data-ack]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-ack');
      await Api.post(`/api/alerts/${id}/ack`);
      await loadAlerts();
    });
  });
}

function bumpAlertBadge() {
  unreadCount++;
  const badge = document.getElementById('alertBadge');
  badge.textContent = unreadCount;
  badge.classList.remove('d-none');
}

const EMERGENCY_TITLES = {
  sos: 'SOS EMERGENCY',
  fall: 'FALL DETECTED',
  geofence_breach: 'ZONE BREACH',
};

function showEmergencyOverlay(alert, childName) {
  const overlay = document.getElementById('emergencyOverlay');
  overlay.classList.toggle('breach-theme', alert.type === 'geofence_breach');
  document.getElementById('emergencyTitle').textContent = EMERGENCY_TITLES[alert.type] || 'ALERT';
  document.getElementById('emergencyMessage').textContent = `${childName}: ${alert.message}`;
  overlay.classList.remove('d-none');
  overlayActiveForAlertId = alert.id;

  document.getElementById('emergencyAckBtn').onclick = async () => {
    await Api.post(`/api/alerts/${alert.id}/ack`);
    overlay.classList.add('d-none');
    overlayActiveForAlertId = null;
    loadAlerts();
  };
}

const OVERLAY_TYPES = new Set(['sos', 'fall', 'geofence_breach']);

document.addEventListener('alert:new', (e) => {
  const a = e.detail;
  bumpAlertBadge();
  if (a.child_id === AppState.currentChildId) loadAlerts();

  if (OVERLAY_TYPES.has(a.type) && a.child_id === AppState.currentChildId && overlayActiveForAlertId === null) {
    showEmergencyOverlay(a, a.childName);
  }
});
document.addEventListener('alert:ack', () => loadAlerts());
document.addEventListener('child:switched', loadAlerts);
document.addEventListener('children:loaded', loadAlerts);
