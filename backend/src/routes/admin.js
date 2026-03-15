const express = require('express');
const bcrypt = require('bcryptjs');
const sql = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

// List all users
router.get('/users', async (req, res) => {
  try {
    const rows = await sql`
      SELECT id, username, full_name, twilio_number, is_active, is_admin, created_at
      FROM users ORDER BY created_at DESC
    `;
    res.json({ users: rows });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new agent
router.post('/users', async (req, res) => {
  try {
    const { username, password, full_name, twilio_number } = req.body;
    if (!username || !password || !full_name) {
      return res.status(400).json({ error: 'Username, password, and full name required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
    if (existing.length) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const rows = await sql`
      INSERT INTO users (username, password_hash, full_name, twilio_number)
      VALUES (${username}, ${password_hash}, ${full_name}, ${twilio_number || null})
      RETURNING id, username, full_name, twilio_number, is_active, is_admin, created_at
    `;
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update agent
router.patch('/users/:id', async (req, res) => {
  try {
    const { twilio_number, password, is_active, full_name } = req.body;
    const userId = req.params.id;

    const existing = await sql`SELECT * FROM users WHERE id = ${userId}`;
    if (!existing.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    let password_hash = existing[0].password_hash;
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      password_hash = await bcrypt.hash(password, 10);
    }

    const rows = await sql`
      UPDATE users SET
        twilio_number = ${twilio_number !== undefined ? twilio_number : existing[0].twilio_number},
        password_hash = ${password_hash},
        is_active = ${is_active !== undefined ? is_active : existing[0].is_active},
        full_name = ${full_name || existing[0].full_name}
      WHERE id = ${userId}
      RETURNING id, username, full_name, twilio_number, is_active, is_admin, created_at
    `;
    res.json({ user: rows[0] });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Team stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await sql`
      SELECT
        u.id, u.username, u.full_name,
        COUNT(cl.id) as total_calls,
        COUNT(cl.id) FILTER (WHERE cl.created_at >= CURRENT_DATE) as calls_today,
        COALESCE(AVG(cl.duration_sec) FILTER (WHERE cl.duration_sec > 0), 0) as avg_duration,
        COUNT(cl.id) FILTER (WHERE cl.status = 'completed') as answered
      FROM users u
      LEFT JOIN call_logs cl ON cl.agent_id = u.id
      WHERE u.is_active = true
      GROUP BY u.id, u.username, u.full_name
      ORDER BY calls_today DESC
    `;
    res.json({ stats });
  } catch (err) {
    console.error('Team stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// All calls across agents with filters
router.get('/calls', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const agentId = req.query.agent_id;
    const direction = req.query.direction;

    let rows, countRows;

    if (agentId && direction) {
      rows = await sql`
        SELECT cl.*, u.username, u.full_name
        FROM call_logs cl JOIN users u ON u.id = cl.agent_id
        WHERE cl.agent_id = ${agentId} AND cl.direction = ${direction}
        ORDER BY cl.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      countRows = await sql`SELECT COUNT(*) as total FROM call_logs WHERE agent_id = ${agentId} AND direction = ${direction}`;
    } else if (agentId) {
      rows = await sql`
        SELECT cl.*, u.username, u.full_name
        FROM call_logs cl JOIN users u ON u.id = cl.agent_id
        WHERE cl.agent_id = ${agentId}
        ORDER BY cl.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      countRows = await sql`SELECT COUNT(*) as total FROM call_logs WHERE agent_id = ${agentId}`;
    } else if (direction) {
      rows = await sql`
        SELECT cl.*, u.username, u.full_name
        FROM call_logs cl JOIN users u ON u.id = cl.agent_id
        WHERE cl.direction = ${direction}
        ORDER BY cl.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      countRows = await sql`SELECT COUNT(*) as total FROM call_logs WHERE direction = ${direction}`;
    } else {
      rows = await sql`
        SELECT cl.*, u.username, u.full_name
        FROM call_logs cl JOIN users u ON u.id = cl.agent_id
        ORDER BY cl.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      countRows = await sql`SELECT COUNT(*) as total FROM call_logs`;
    }

    res.json({
      calls: rows,
      pagination: {
        page, limit,
        total: parseInt(countRows[0].total),
        pages: Math.ceil(parseInt(countRows[0].total) / limit),
      },
    });
  } catch (err) {
    console.error('Admin calls error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
