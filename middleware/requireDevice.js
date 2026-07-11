/*
 * middleware/requireDevice.js
 * ------------------------------------------------------------------
 * Simple shared-secret check for the ESP32 telemetry endpoint. The
 * device sends X-Device-Id + X-Device-Secret headers (see network_manager.cpp); 
 * this must match DEVICE_SHARED_SECRET in the
 * server's .env.
 * ------------------------------------------------------------------
 */
module.exports = function requireDevice(req, res, next) {
  const deviceId = req.header('X-Device-Id');
  const deviceSecret = req.header('X-Device-Secret');

  if (!deviceId || !deviceSecret) {
    return res.status(401).json({ error: 'Missing device credentials' });
  }
  if (deviceSecret !== process.env.DEVICE_SHARED_SECRET) {
    return res.status(403).json({ error: 'Invalid device secret' });
  }

  req.deviceId = deviceId;
  next();
};
