/*
 * server.js
 * ------------------------------------------------------------------
 * Entry point. Serves the static dashboard (public/), exposes the
 * REST API used by both the browser dashboard and the ESP32 device,
 * and runs a Socket.io server for live push updates to the browser.
 *
 * To deploy this to a cloud host with a persistent disk (docs/DEPLOYMENT_GUIDE.md) so it has ONE fixed public URL that both
 * the parent's browser and the ESP32 always hit -- no local IP/hotspot
 * management required.
 * ------------------------------------------------------------------
 */
require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieSession = require('cookie-session');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const childrenRoutes = require('./routes/children');
const geofenceRoutes = require('./routes/geofence');
const alertsRoutes = require('./routes/alerts');
const deviceRoutes = require('./routes/device');
const historyRoutes = require('./routes/history');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);

app.use(cors());
app.use(bodyParser.json({ limit: '256kb' }));
app.use(
  cookieSession({
    name: 'tracker_session',
    keys: [process.env.SESSION_SECRET || 'dev-secret-change-me'],
    maxAge: 12 * 60 * 60 * 1000, // 12h
  })
);

// --- API routes ---
app.use('/api/auth', authRoutes);
app.use('/api/children', childrenRoutes);
app.use('/api/geofence', geofenceRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/device', deviceRoutes);
app.use('/api/history', historyRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// --- static dashboard ---
app.use(express.static(path.join(__dirname, 'public')));

// SPA-style fallback: any non-API GET that doesn't match a static file
// goes to index.html (dashboard) if logged in, else login.html.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (req.session && req.session.loggedIn) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
});

io.on('connection', socket => {
  console.log(`[socket] dashboard connected: ${socket.id}`);
  socket.on('disconnect', () => console.log(`[socket] dashboard disconnected: ${socket.id}`));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Child Tracker server listening on port ${PORT}`);
});
