/*
 * dashboard.js -- tab switching + initial app bootstrap. Loaded last.
 */

document.querySelectorAll('#mainTabs .nav-link').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#mainTabs .nav-link').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const target = btn.getAttribute('data-tab');
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('d-none'));
    document.getElementById(`tab-${target}`).classList.remove('d-none');

    // Leaflet needs a nudge to recompute size when its container was
    // previously hidden (display:none) and just became visible.
    if (target === 'map' && typeof liveMap !== 'undefined' && liveMap) {
      setTimeout(() => liveMap.invalidateSize(), 50);
    }
    if (target === 'overview' && typeof miniMap !== 'undefined' && miniMap) {
      setTimeout(() => miniMap.invalidateSize(), 50);
    }
  });
});

async function initDashboard() {
  const me = await Api.get('/api/auth/me');
  if (!me || !me.loggedIn) { window.location.href = '/login.html'; return; }

  await loadChildren();
  await loadZonePool();
}

document.addEventListener('DOMContentLoaded', initDashboard);