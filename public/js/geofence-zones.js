/*
 * geofence-zones.js -- lets the parent pick a zone group (e.g. "Home
 * only" or "Home -> School -> Granny's -> Home") from the designated
 * pool and assign it to the currently selected child.
 */

async function loadZonePool() {
  const data = await Api.get('/api/geofence/pool');
  if (!data) return;
  AppState.zonePool = data.zonePool;
  AppState.zoneGroups = data.zoneGroups;
  renderZoneGroupOptions();
}

function renderZoneGroupOptions() {
  const container = document.getElementById('zoneGroupOptions');
  const child = getCurrentChild();
  container.innerHTML = AppState.zoneGroups.map(g => {
    const stopNames = g.stops
      .map(id => AppState.zonePool.find(z => z.id === id)?.name || id)
      .join(' → ');
    const selected = child && child.currentZone && child.active_zone_group_id === g.id;
    return `
      <div class="zone-group-card ${selected ? 'selected' : ''}" data-group="${g.id}">
        <div class="zg-label">${escapeHtml(g.label)}</div>
        <div class="zg-stops">${escapeHtml(stopNames)}</div>
      </div>`;
  }).join('');

  container.querySelectorAll('[data-group]').forEach(card => {
    card.addEventListener('click', async () => {
      if (!AppState.currentChildId) { alert('Select or add a child first.'); return; }
      const groupId = card.getAttribute('data-group');
      await Api.post('/api/geofence/assign', { childId: AppState.currentChildId, zoneGroupId: groupId });
      await loadChildren();
      renderZoneGroupOptions();
      renderCurrentZoneStatus();
    });
  });
}

function renderCurrentZoneStatus() {
  const box = document.getElementById('currentZoneStatus');
  const child = getCurrentChild();
  if (!child) { box.textContent = 'No child selected.'; return; }
  if (!child.currentZone) {
    box.textContent = `${child.name} has no geofence plan assigned yet -- pick one above.`;
    return;
  }
  box.innerHTML = `<strong>${escapeHtml(child.name)}</strong> is currently expected at
    <strong>${escapeHtml(child.currentZone.name)}</strong>
    (${child.currentZone.radiusM}m radius). The tracker will show realistic movement within this area.`;
}

document.addEventListener('children:loaded', () => {
  renderZoneGroupOptions();
  renderCurrentZoneStatus();
});
document.addEventListener('child:switched', () => {
  renderZoneGroupOptions();
  renderCurrentZoneStatus();
});
document.addEventListener('telemetry:update', (e) => {
  if (e.detail.childId === AppState.currentChildId) {
    const child = getCurrentChild();
    if (child) child.currentZone = e.detail.currentZone;
    renderCurrentZoneStatus();
  }
});
