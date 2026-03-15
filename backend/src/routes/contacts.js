const express = require('express');
const sql = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

// Get agent's contacts with search and filter
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status;

    let rows, countRows;

    if (search && status) {
      const searchPattern = `%${search}%`;
      rows = await sql`
        SELECT * FROM contacts
        WHERE assigned_to = ${req.user.id}
          AND status = ${status}
          AND (name ILIKE ${searchPattern} OR phone ILIKE ${searchPattern} OR company ILIKE ${searchPattern})
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      countRows = await sql`
        SELECT COUNT(*) as total FROM contacts
        WHERE assigned_to = ${req.user.id} AND status = ${status}
          AND (name ILIKE ${searchPattern} OR phone ILIKE ${searchPattern} OR company ILIKE ${searchPattern})
      `;
    } else if (search) {
      const searchPattern = `%${search}%`;
      rows = await sql`
        SELECT * FROM contacts
        WHERE assigned_to = ${req.user.id}
          AND (name ILIKE ${searchPattern} OR phone ILIKE ${searchPattern} OR company ILIKE ${searchPattern})
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      countRows = await sql`
        SELECT COUNT(*) as total FROM contacts
        WHERE assigned_to = ${req.user.id}
          AND (name ILIKE ${searchPattern} OR phone ILIKE ${searchPattern} OR company ILIKE ${searchPattern})
      `;
    } else if (status) {
      rows = await sql`
        SELECT * FROM contacts
        WHERE assigned_to = ${req.user.id} AND status = ${status}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      countRows = await sql`
        SELECT COUNT(*) as total FROM contacts WHERE assigned_to = ${req.user.id} AND status = ${status}
      `;
    } else {
      rows = await sql`
        SELECT * FROM contacts
        WHERE assigned_to = ${req.user.id}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
      countRows = await sql`SELECT COUNT(*) as total FROM contacts WHERE assigned_to = ${req.user.id}`;
    }

    res.json({
      contacts: rows,
      pagination: {
        page, limit,
        total: parseInt(countRows[0].total),
        pages: Math.ceil(parseInt(countRows[0].total) / limit),
      },
    });
  } catch (err) {
    console.error('Get contacts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add new contact
router.post('/', async (req, res) => {
  try {
    const { name, phone, company, email, status, notes } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    // Validate E.164 format
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      return res.status(400).json({ error: 'Phone must be in E.164 format (e.g., +923001234567)' });
    }

    const rows = await sql`
      INSERT INTO contacts (name, phone, company, email, status, notes, assigned_to)
      VALUES (${name || null}, ${phone}, ${company || null}, ${email || null}, ${status || 'new'}, ${notes || null}, ${req.user.id})
      RETURNING *
    `;
    res.status(201).json({ contact: rows[0] });
  } catch (err) {
    console.error('Add contact error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update contact
router.patch('/:id', async (req, res) => {
  try {
    const { name, phone, company, email, status, notes } = req.body;

    if (phone && !/^\+[1-9]\d{6,14}$/.test(phone)) {
      return res.status(400).json({ error: 'Phone must be in E.164 format' });
    }

    const existing = await sql`SELECT * FROM contacts WHERE id = ${req.params.id} AND assigned_to = ${req.user.id}`;
    if (!existing.length) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const rows = await sql`
      UPDATE contacts SET
        name = ${name !== undefined ? name : existing[0].name},
        phone = ${phone || existing[0].phone},
        company = ${company !== undefined ? company : existing[0].company},
        email = ${email !== undefined ? email : existing[0].email},
        status = ${status || existing[0].status},
        notes = ${notes !== undefined ? notes : existing[0].notes}
      WHERE id = ${req.params.id} AND assigned_to = ${req.user.id}
      RETURNING *
    `;
    res.json({ contact: rows[0] });
  } catch (err) {
    console.error('Update contact error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete contact
router.delete('/:id', async (req, res) => {
  try {
    const rows = await sql`
      DELETE FROM contacts WHERE id = ${req.params.id} AND assigned_to = ${req.user.id} RETURNING id
    `;
    if (!rows.length) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    res.json({ message: 'Contact deleted' });
  } catch (err) {
    console.error('Delete contact error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
