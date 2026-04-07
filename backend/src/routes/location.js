const express = require('express');
const sql = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// POST /api/location — save current user's GPS location
router.post('/', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (lat == null || lng == null) {
      return res.status(400).json({ error: 'lat and lng required' });
    }
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    if (isNaN(latitude) || isNaN(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }
    await sql`
      UPDATE users SET latitude = ${latitude}, longitude = ${longitude}, location_updated_at = NOW()
      WHERE id = ${req.user.id}
    `;
    res.json({ ok: true });
  } catch (err) {
    console.error('Location update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/location — admin only, returns all agents with last known location
router.get('/', adminMiddleware, async (req, res) => {
  try {
    const rows = await sql`
      SELECT id, full_name, username, is_active, latitude, longitude, location_updated_at
      FROM users
      ORDER BY full_name ASC
    `;
    res.json({ locations: rows });
  } catch (err) {
    console.error('Get locations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
