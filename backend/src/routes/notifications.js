const express = require('express');
const sql = require('../db');
const { authMiddleware } = require('../middleware/auth');
const fcm = require('../services/fcm');

const router = express.Router();

router.use(authMiddleware);

// End-to-end FCM test: sends a fake SMS push to the caller's registered
// devices and reports exactly what happened — verifies the Firebase key,
// device tokens, and the phone's notification handling in isolation.
router.post('/test', async (req, res) => {
  try {
    if (!fcm.isConfigured()) {
      return res.json({ ok: false, reason: 'FIREBASE_SERVICE_ACCOUNT not set or invalid on the server' });
    }
    const tokenRows = await sql`SELECT token FROM device_tokens WHERE user_id = ${req.user.id}`;
    if (!tokenRows.length) {
      return res.json({ ok: false, reason: 'No device tokens registered for this user — open the app and log in first' });
    }
    const dead = await fcm.sendToTokens(
      tokenRows.map((r) => r.token),
      {
        type: 'sms',
        number: '+10000000000',
        name: 'Push Test',
        body: `Test notification — ${new Date().toISOString()}`,
      }
    );
    for (const deadToken of dead) {
      await sql`DELETE FROM device_tokens WHERE token = ${deadToken}`;
    }
    res.json({
      ok: true,
      devices: tokenRows.length,
      delivered: tokenRows.length - dead.length,
      deadTokensRemoved: dead.length,
    });
  } catch (err) {
    console.error('Push test error:', err);
    res.status(500).json({ ok: false, reason: err.message });
  }
});

// Register (or re-assign) this device's FCM token to the logged-in agent.
// A token is unique per device — if another account logs in on the same
// device, the token moves to that account so pushes follow the active user.
router.post('/device', async (req, res) => {
  try {
    const token = (req.body.token || '').trim();
    const platform = (req.body.platform || 'android').slice(0, 10);
    if (!token) {
      return res.status(400).json({ error: 'token required' });
    }

    // The app reports whether Twilio voice registration succeeded alongside
    // its FCM token — makes "phone kyun nahi baja" diagnosable from logs.
    if (req.body.voiceRegistered !== undefined) {
      console.log('[notifications /device] user=%s voiceRegistered=%s%s',
        req.user.username, req.body.voiceRegistered,
        req.body.voiceError ? ` error="${String(req.body.voiceError).slice(0, 160)}"` : '');
    }

    await sql`
      INSERT INTO device_tokens (user_id, token, platform, updated_at)
      VALUES (${req.user.id}, ${token}, ${platform}, NOW())
      ON CONFLICT (token) DO UPDATE SET user_id = ${req.user.id}, updated_at = NOW()
    `;
    res.json({ ok: true });
  } catch (err) {
    console.error('Register device token error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove this device's token (called on logout, before the JWT is discarded)
router.delete('/device', async (req, res) => {
  try {
    const token = (req.body.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'token required' });
    }
    await sql`DELETE FROM device_tokens WHERE token = ${token} AND user_id = ${req.user.id}`;
    res.json({ ok: true });
  } catch (err) {
    console.error('Remove device token error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
