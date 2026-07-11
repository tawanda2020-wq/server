/*
 * middleware/requireAuth.js
 * ------------------------------------------------------------------
 * Guards dashboard API routes behind a logged-in parent session.
 * Session state is a signed cookie (cookie-session) set by
 * routes/auth.js on successful demo login.
 * ------------------------------------------------------------------
 */
module.exports = function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) {
    return next();
  }
  return res.status(401).json({ error: 'Not authenticated' });
};
