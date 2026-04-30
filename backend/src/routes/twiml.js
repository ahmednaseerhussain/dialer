const express = require('express');
const { VoiceResponse } = require('twilio').twiml;
const sql = require('../db');
const { twilioWebhookMiddleware } = require('../middleware/twilioValidation');

const router = express.Router();

function publicBaseUrl(req) {
  // Prefer the explicit external URL (Render), fall back to the request host
  const env = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_BASE_URL;
  if (env) return env.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  return `${proto}://${req.get('host')}`;
}

// Outbound call — TwiML App Voice URL
router.post('/voice', twilioWebhookMiddleware, async (req, res) => {
  try {
    const twiml = new VoiceResponse();
    const to = req.body.To;
    const identity = req.body.From?.replace('client:', '');
    const base = publicBaseUrl(req);

    console.log('[twiml /voice] CallSid=%s From=%s To=%s identity=%s',
      req.body.CallSid, req.body.From, to, identity);

    if (!to) {
      console.warn('[twiml /voice] missing To param');
      twiml.say('No destination number provided.');
      return res.type('text/xml').send(twiml.toString());
    }

    // If dialing a phone number (not a client)
    if (to.startsWith('+')) {
      // E.164 validation — must be + followed by 8–15 digits
      if (!/^\+\d{8,15}$/.test(to)) {
        console.warn('[twiml /voice] invalid E.164 number: %s', to);
        twiml.say('The number you dialed is not valid. Please check the number and try again.');
        return res.type('text/xml').send(twiml.toString());
      }
      // Look up agent's Twilio number for CallerID, with env fallback for testing
      let callerId;
      if (identity) {
        const rows = await sql`SELECT twilio_number FROM users WHERE username = ${identity}`;
        callerId = rows.length ? rows[0].twilio_number : null;
      }
      if (!callerId) {
        callerId = process.env.TWILIO_DEFAULT_CALLER_ID || null;
        if (callerId) {
          console.warn('[twiml /voice] using TWILIO_DEFAULT_CALLER_ID fallback for %s', identity);
        }
      }

      if (!callerId) {
        console.error('[twiml /voice] no callerId for identity=%s — set users.twilio_number or TWILIO_DEFAULT_CALLER_ID', identity);
        twiml.say('No Twilio number assigned to your account. Please contact your administrator.');
        return res.type('text/xml').send(twiml.toString());
      }

      console.log('[twiml /voice] dialing %s from callerId=%s', to, callerId);

      const dial = twiml.dial({
        callerId,
        record: 'record-from-ringing',
        recordingStatusCallback: `${base}/api/twiml/status`,
        recordingStatusCallbackMethod: 'POST',
        action: `${base}/api/twiml/status`,
        method: 'POST',
        answerOnBridge: true,
        timeout: 30,
      });
      dial.number(to);

      // Log the outbound call
      if (identity) {
        await sql`
          INSERT INTO call_logs (agent_id, call_sid, direction, from_number, to_number, status)
          SELECT u.id, ${req.body.CallSid}, 'outbound', ${callerId}, ${to}, 'initiated'
          FROM users u WHERE u.username = ${identity}
          ON CONFLICT (call_sid) DO NOTHING
        `;
      }
    } else {
      // Client-to-client call
      const dial = twiml.dial();
      dial.client(to);
    }

    const xml = twiml.toString();
    console.log('[twiml /voice] response:', xml);
    res.type('text/xml').send(xml);
  } catch (err) {
    console.error('TwiML voice error:', err);
    const twiml = new VoiceResponse();
    twiml.say('An error occurred. Please try again.');
    res.type('text/xml').send(twiml.toString());
  }
});

// Inbound call — per Twilio number
router.post('/inbound/:number', twilioWebhookMiddleware, async (req, res) => {
  try {
    const twiml = new VoiceResponse();
    const inboundNumber = req.params.number;
    const base = publicBaseUrl(req);

    const rows = await sql`SELECT id, username FROM users WHERE twilio_number = ${inboundNumber} AND is_active = true`;

    if (!rows.length) {
      twiml.say('This number is not currently assigned to an agent. Please try again later.');
      return res.type('text/xml').send(twiml.toString());
    }

    const dial = twiml.dial({
      timeout: 25,
      answerOnBridge: true,
      action: `${base}/api/twiml/status`,
      method: 'POST',
    });
    // Ring all agents assigned to this number (handles multiple agents sharing a number)
    for (const agent of rows) {
      dial.client(agent.username);
    }

    // Log the inbound call under the first matching agent
    const agent = rows[0];
    await sql`
      INSERT INTO call_logs (agent_id, call_sid, direction, from_number, to_number, status)
      VALUES (${agent.id}, ${req.body.CallSid}, 'inbound', ${req.body.From}, ${inboundNumber}, 'ringing')
    `;

    // After dial completes (no answer / busy), say goodbye
    twiml.say('The agent is unavailable right now. Please try again later.');

    res.type('text/xml').send(twiml.toString());
  } catch (err) {
    console.error('TwiML inbound error:', err);
    const twiml = new VoiceResponse();
    twiml.say('An error occurred. Please try again.');
    res.type('text/xml').send(twiml.toString());
  }
});

// Status callback — update call logs
router.post('/status', twilioWebhookMiddleware, async (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration, RecordingUrl } = req.body;

    if (CallSid) {
      await sql`
        UPDATE call_logs SET
          status = ${CallStatus || 'unknown'},
          duration_sec = ${CallDuration ? parseInt(CallDuration, 10) : null},
          recording_url = ${RecordingUrl || null}
        WHERE call_sid = ${CallSid}
      `;
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Status callback error:', err);
    res.sendStatus(200);
  }
});

module.exports = router;
