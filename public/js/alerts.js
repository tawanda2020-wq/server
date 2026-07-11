/*
 * alerts.js -- alert log rendering (Overview "recent" + full Alerts
 * tab), acknowledgement actions, unread badge count, and the
 * full-screen emergency overlay for SOS/fall events.
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

function showEmergencyOverlay(alert, childName) {
  const overlay = document.getElementById('emergencyOverlay');
  document.getElementById('emergencyTitle').textContent =
    alert.type === 'sos' ? 'SOS EMERGENCY' : 'FALL DETECTED';
  document.getElementById('emergencyMessage').textContent = `${childName}: ${alert.message}`;
  overlay.classList.remove('d-none');

  document.getElementById('emergencyAckBtn').onclick = async () => {
    await Api.post(`/api/alerts/${alert.id}/ack`);
    overlay.classList.add('d-none');
    loadAlerts();
  };
}

document.addEventListener('alert:new', (e) => {
  const a = e.detail;
  bumpAlertBadge();
  if (a.child_id === AppState.currentChildId) loadAlerts();
  if ((a.type === 'sos' || a.type === 'fall') && a.child_id === AppState.currentChildId) {
    showEmergencyOverlay(a, a.childName);
  }
});
document.addEventListener('alert:ack', () => loadAlerts());
document.addEventListener('child:switched', loadAlerts);
document.addEventListener('children:loaded', loadAlerts);
