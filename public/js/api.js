/*
 * api.js -- small fetch wrapper + shared app state used by every other
 * dashboard script. Load this first.
 */
const Api = {
  async get(url) {
    const res = await fetch(url);
    if (res.status === 401) { window.location.href = '/login.html'; return null; }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  },
  async post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (res.status === 401) { window.location.href = '/login.html'; return null; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  },
  async delete(url) {
    const res = await fetch(url, { method: 'DELETE' });
    if (res.status === 401) { window.location.href = '/login.html'; return null; }
    return res.json().catch(() => ({}));
  },
};

// Shared, mutable app state that every module reads/writes.
const AppState = {
  children: [],
  currentChildId: null,
  zonePool: [],
  zoneGroups: [],
  breachLocations: [],
};

function getCurrentChild() {
  return AppState.children.find(c => c.id === AppState.currentChildId) || null;
}
