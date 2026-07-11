/*
 * services/thresholds.js
 * ------------------------------------------------------------------
 * SINGLE SOURCE OF TRUTH for every server-side threshold, cooldown,
 * and timing value. Mirrors esp32-firmware/ChildTracker/config.h --
 * ------------------------------------------------------------------
 */

module.exports = {
  // --- Health ---
  TEMP_HIGH_C: 38.0,
  TEMP_LOW_C: 20.0,
  SPO2_LOW_PCT: 90,
  HR_LOW_BPM: 60,
  HR_HIGH_BPM: 140,

  // --- Battery ---
  BATTERY_LOW_PCT: 20,

  // --- SMS anti-spam cooldowns (ms) ---
  SMS_COOLDOWN_GEOFENCE_MS: 1 * 60 * 1000,   // 1 min
  SMS_COOLDOWN_TEMP_MS: 1 * 60 * 1000,       // 1 min
  SMS_COOLDOWN_BATTERY_MS: 2 * 60 * 1000,    // 2 min
  // Fall + SOS are one-shot per event -- re-arm only after the event clears
  // (enforced in services/alertManager.js by tracking "active event" state,
  // not a timer).

  // --- Geofence journey pacing ---
  // How often the server advances a child's "current stop" when they are
  // assigned a multi-stop zone group (e.g. Home -> School -> Granny's ->
  // Home), so the demo shows a realistic day without waiting for real time
  // to pass.
  JOURNEY_STOP_DURATION_MS: 25 * 1000,    // 30 seconds per stop

  // --- Dashboard breach-demo display ---
  BREACH_DISPLAY_DURATION_MS: 10 * 1000,      // 10s alert banner, then auto-clear

  // --- Device telemetry freshness ---
  // If a device hasn't POSTed telemetry within this window, the dashboard
  // shows it as "offline" rather than silently keeping stale data on screen.
  DEVICE_STALE_AFTER_MS: 30 * 1000,
};
