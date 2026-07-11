/*
 * routes/auth.js
 * ------------------------------------------------------------------
 * Minimal demo authentication: one parent account, credentials from
 * .env (DEMO_USERNAME / DEMO_PASSWORD).
 * ------------------------------------------------------------------
 */
const express = require('express');
const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.DEMO_USERNAME &&
    password === process.env.DEMO_PASSWORD
  ) {
    req.session.loggedIn = true;
    req.session.username = username;
    return res.json({ ok: true });
  }

  return res.status(401).json({ error: 'Invalid demo credentials' });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (req.session && req.session.loggedIn) {
    return res.json({ loggedIn: true, username: req.session.username });
  }
  return res.json({ loggedIn: false });
});

module.exports = router;
