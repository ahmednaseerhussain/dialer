const express = require('express');
const sql = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

// Get agent's call history with pagination
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const direction = req.query.direction; // 'inbound', 'outbound', or undefined for all

    let rows;
    let countRows;

    if (direction && ['inbound', 'outbound'].includes(direction)) {
      rows = await sql`
        SELECT * FROM call_logs
        WHERE agent_id = ${req.user.id} AND direction = ${direction}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countRows = await sql`SELECT COUNT(*) as total FROM call_logs WHERE agent_id = ${req.user.id} AND direction = ${direction}`;
    } else {
      rows = await sql`
        SELECT * FROM call_logs
        WHERE agent_id = ${req.user.id}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      countRows = await sql`SELECT COUNT(*) as total FROM call_logs WHERE agent_id = ${req.user.id}`;
    }

    res.json({
      calls: rows,
      pagination: {
        page,
        limit,
        total: parseInt(countRows[0].total),
        pages: Math.ceil(parseInt(countRows[0].total) / limit),
      },
    });
  } catch (err) {
    console.error('Get calls error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save notes for a call by Twilio CallSid. For inbound calls the app only
// knows its client-leg SID (the log stores the parent PSTN SID), so fall
// back to the agent's most recent call log from the last hour.
router.patch('/notes', async (req, res) => {
  try {
    const { callSid, notes } = req.body;
    if (typeof notes !== 'string' || !notes.trim()) {
      return res.status(400).json({ error: 'Notes required' });
    }

    let rows = [];
    if (callSid) {
      rows = await sql`
        UPDATE call_logs SET notes = ${notes}
        WHERE call_sid = ${callSid} AND agent_id = ${req.user.id}
        RETURNING *
      `;
    }
    if (!rows.length) {
      rows = await sql`
        UPDATE call_logs SET notes = ${notes}
        WHERE id = (
          SELECT id FROM call_logs
          WHERE agent_id = ${req.user.id} AND created_at >= NOW() - INTERVAL '1 hour'
          ORDER BY created_at DESC
          LIMIT 1
        )
        RETURNING *
      `;
    }
    if (!rows.length) {
      return res.status(404).json({ error: 'Call not found' });
    }
    res.json({ call: rows[0] });
  } catch (err) {
    console.error('Save notes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update call notes
router.patch('/:id/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    const rows = await sql`
      UPDATE call_logs SET notes = ${notes}
      WHERE id = ${req.params.id} AND agent_id = ${req.user.id}
      RETURNING *
    `;
    if (!rows.length) {
      return res.status(404).json({ error: 'Call not found' });
    }
    res.json({ call: rows[0] });
  } catch (err) {
    console.error('Update notes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Call stats
router.get('/stats', async (req, res) => {
  try {
    const todayStats = await sql`
      SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE direction = 'outbound') as outbound,
        COUNT(*) FILTER (WHERE direction = 'inbound') as inbound,
        COALESCE(AVG(duration_sec) FILTER (WHERE duration_sec > 0), 0) as avg_duration,
        COUNT(*) FILTER (WHERE status = 'completed') as answered,
        COUNT(*) FILTER (WHERE status IN ('no-answer', 'busy', 'failed')) as missed
      FROM call_logs
      WHERE agent_id = ${req.user.id}
        AND created_at >= CURRENT_DATE
    `;

    const weekStats = await sql`
      SELECT
        COUNT(*) as total_calls,
        COALESCE(AVG(duration_sec) FILTER (WHERE duration_sec > 0), 0) as avg_duration,
        COUNT(*) FILTER (WHERE status = 'completed') as answered
      FROM call_logs
      WHERE agent_id = ${req.user.id}
        AND created_at >= CURRENT_DATE - INTERVAL '7 days'
    `;

    res.json({
      today: todayStats[0],
      week: weekStats[0],
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
