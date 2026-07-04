const express = require('express');
const twilio = require('twilio');
const { MessagingResponse } = require('twilio').twiml;
const sql = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { twilioWebhookMiddleware } = require('../middleware/twilioValidation');
const fcm = require('../services/fcm');

const router = express.Router();

function publicBaseUrl(req) {
  const env = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_BASE_URL;
  if (env) return env.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  return `${proto}://${req.get('host')}`;
}

let twilioClient = null;
function getTwilioClient() {
  if (!twilioClient) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

// ---------------------------------------------------------------------------
// Twilio webhooks — registered BEFORE authMiddleware; validated by signature.
// ---------------------------------------------------------------------------

// Inbound SMS — configure each Twilio number's "A message comes in" webhook
// to POST {base}/api/messages/inbound/{thatNumber}
router.post('/inbound/:number', twilioWebhookMiddleware, async (req, res) => {
  // Always answer Twilio with valid (empty) TwiML first — an error here
  // must not make Twilio retry into a duplicate or show the sender an error.
  const twiml = new MessagingResponse();
  res.type('text/xml').send(twiml.toString());

  try {
    const inboundNumber = req.params.number;
    const { MessageSid, From, Body } = req.body;
    if (!MessageSid || !From) return;

    const rows = await sql`
      SELECT id FROM users WHERE twilio_number = ${inboundNumber} AND is_active = true
    `;
    if (!rows.length) {
      console.warn('[messages /inbound] no active agent for number %s', inboundNumber);
      return;
    }

    const inserted = await sql`
      INSERT INTO messages (agent_id, message_sid, direction, from_number, to_number, body, status)
      VALUES (${rows[0].id}, ${MessageSid}, 'inbound', ${From}, ${inboundNumber}, ${Body || ''}, 'received')
      ON CONFLICT (message_sid) DO NOTHING
      RETURNING id
    `;

    // Push notification to the agent's devices (skip Twilio webhook retries
    // that hit the ON CONFLICT path — they were already notified).
    if (inserted.length && fcm.isConfigured()) {
      try {
        const tokenRows = await sql`SELECT token FROM device_tokens WHERE user_id = ${rows[0].id}`;
        if (tokenRows.length) {
          const contactRows = await sql`
            SELECT name FROM contacts WHERE phone = ${From} AND name IS NOT NULL AND name <> '' LIMIT 1
          `;
          const dead = await fcm.sendToTokens(
            tokenRows.map((r) => r.token),
            {
              type: 'sms',
              number: From,
              name: contactRows[0]?.name || '',
              body: (Body || '').slice(0, 240),
            }
          );
          for (const deadToken of dead) {
            await sql`DELETE FROM device_tokens WHERE token = ${deadToken}`;
          }
        }
      } catch (pushErr) {
        console.warn('[messages /inbound] push failed:', pushErr.message);
      }
    }
  } catch (err) {
    console.error('Inbound SMS error:', err);
  }
});

// Outbound SMS delivery status callback
router.post('/status', twilioWebhookMiddleware, async (req, res) => {
  try {
    const { MessageSid, MessageStatus } = req.body;
    if (MessageSid && MessageStatus) {
      await sql`
        UPDATE messages SET status = ${MessageStatus}
        WHERE message_sid = ${MessageSid}
      `;
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('SMS status callback error:', err);
    res.sendStatus(200);
  }
});

// ---------------------------------------------------------------------------
// Authenticated app APIs
// ---------------------------------------------------------------------------
router.use(authMiddleware);

// Conversation list — latest message per counterpart number, with unread
// count and contact name when a contact matches the number.
router.get('/', async (req, res) => {
  try {
    const rows = await sql`
      SELECT conv.*, c.name AS contact_name
      FROM (
        SELECT * FROM (
          SELECT DISTINCT ON (sub.counterpart)
            sub.counterpart,
            sub.body,
            sub.direction,
            sub.status,
            sub.created_at,
            COUNT(*) FILTER (WHERE sub.direction = 'inbound' AND NOT sub.is_read)
              OVER (PARTITION BY sub.counterpart) AS unread_count
          FROM (
            SELECT m.*,
              CASE WHEN m.direction = 'outbound' THEN m.to_number ELSE m.from_number END AS counterpart
            FROM messages m
            WHERE m.agent_id = ${req.user.id}
          ) sub
          ORDER BY sub.counterpart, sub.created_at DESC
        ) latest
        ORDER BY latest.created_at DESC
        LIMIT 100
      ) conv
      LEFT JOIN LATERAL (
        SELECT name FROM contacts
        WHERE phone = conv.counterpart AND name IS NOT NULL AND name <> ''
        LIMIT 1
      ) c ON true
      ORDER BY conv.created_at DESC
    `;
    res.json({ conversations: rows });
  } catch (err) {
    console.error('List conversations error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Full thread with one number (newest first, for an inverted list).
// Opening a thread marks its inbound messages as read.
router.get('/thread', async (req, res) => {
  try {
    const number = (req.query.number || '').trim();
    if (!number) {
      return res.status(400).json({ error: 'number query param required' });
    }

    const rows = await sql`
      SELECT * FROM messages
      WHERE agent_id = ${req.user.id}
        AND (from_number = ${number} OR to_number = ${number})
      ORDER BY created_at DESC
      LIMIT 200
    `;

    sql`
      UPDATE messages SET is_read = true
      WHERE agent_id = ${req.user.id} AND direction = 'inbound'
        AND from_number = ${number} AND NOT is_read
    `.catch((err) => console.warn('Mark-read failed:', err.message));

    res.json({ messages: rows });
  } catch (err) {
    console.error('Get thread error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send an SMS from the agent's Twilio number
router.post('/send', async (req, res) => {
  try {
    const body = (req.body.body || '').trim();
    let to = (req.body.to || '').trim().replace(/[^\d+]/g, '');
    if (to && !to.startsWith('+')) to = `+${to}`;

    if (!body) {
      return res.status(400).json({ error: 'Message body required' });
    }
    if (body.length > 1600) {
      return res.status(400).json({ error: 'Message too long (max 1600 characters)' });
    }
    if (!/^\+\d{8,15}$/.test(to)) {
      return res.status(400).json({ error: 'Invalid number — use E.164 format like +923001234567' });
    }

    const userRows = await sql`SELECT twilio_number FROM users WHERE id = ${req.user.id}`;
    const from = userRows[0]?.twilio_number || process.env.TWILIO_DEFAULT_CALLER_ID;
    if (!from) {
      return res.status(400).json({ error: 'No Twilio number assigned to your account. Contact your administrator.' });
    }

    const message = await getTwilioClient().messages.create({
      from,
      to,
      body,
      statusCallback: `${publicBaseUrl(req)}/api/messages/status`,
    });

    const rows = await sql`
      INSERT INTO messages (agent_id, message_sid, direction, from_number, to_number, body, status, is_read)
      VALUES (${req.user.id}, ${message.sid}, 'outbound', ${from}, ${to}, ${body}, ${message.status || 'queued'}, true)
      ON CONFLICT (message_sid) DO NOTHING
      RETURNING *
    `;
    res.status(201).json({ message: rows[0] || null });
  } catch (err) {
    console.error('Send SMS error:', err);
    // Surface Twilio's own message (e.g. trial-account restrictions) to the app
    const detail = err?.message && err?.code ? `${err.message} (Twilio ${err.code})` : null;
    res.status(500).json({ error: detail || 'Failed to send message' });
  }
});

module.exports = router;
