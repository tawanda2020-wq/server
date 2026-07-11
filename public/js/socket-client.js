/*
 * socket-client.js -- connects to the server's Socket.io endpoint and
 * re-dispatches events as browser CustomEvents so every other module
 * can listen with plain addEventListener, without importing socket.io
 * directly everywhere.
 */
const socket = io();

socket.on('connect', () => {
  document.dispatchEvent(new CustomEvent('conn:change', { detail: { online: true } }));
});
socket.on('disconnect', () => {
  document.dispatchEvent(new CustomEvent('conn:change', { detail: { online: false } }));
});

socket.on('telemetry:update', (data) => {
  document.dispatchEvent(new CustomEvent('telemetry:update', { detail: data }));
});
socket.on('alert:new', (data) => {
  document.dispatchEvent(new CustomEvent('alert:new', { detail: data }));
});
socket.on('alert:ack', (data) => {
  document.dispatchEvent(new CustomEvent('alert:ack', { detail: data }));
});
socket.on('geofence:breach', (data) => {
  document.dispatchEvent(new CustomEvent('geofence:breach', { detail: data }));
});

document.addEventListener('conn:change', (e) => {
  const badge = document.getElementById('connStatus');
  if (!badge) return;
  if (e.detail.online) {
    badge.textContent = '● online';
    badge.classList.remove('offline');
    badge.classList.add('online');
  } else {
    badge.textContent = '● offline';
    badge.classList.remove('online');
    badge.classList.add('offline');
  }
});
