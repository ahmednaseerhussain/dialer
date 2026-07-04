const express = require('express');
const sql = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

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
