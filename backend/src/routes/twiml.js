const express = require('express');
const { VoiceResponse } = require('twilio').twiml;
const sql = require('../db');
const { twilioWebhookMiddleware } = require('../middleware/twilioValidation');

const router = express.Router();

// Outbound call — TwiML App Voice URL
router.post('/voice', twilioWebhookMiddleware, async (req, res) => {
  try {
    const twiml = new VoiceResponse();
    const to = req.body.To;
    const identity = req.body.From?.replace('client:', '');

    if (!to) {
      twiml.say('No destination number provided.');
      return res.type('text/xml').send(twiml.toString());
    }

    // If dialing a phone number (not a client)
    if (to.startsWith('+')) {
      // Look up agent's Twilio number for CallerID
      const rows = await sql`SELECT twilio_number FROM users WHERE username = ${identity}`;
      const callerId = rows.length ? rows[0].twilio_number : undefined;

      if (!callerId) {
        twiml.say('No Twilio number assigned to your account.');
        return res.type('text/xml').send(twiml.toString());
      }

      const dial = twiml.dial({
        callerId,
        record: 'record-from-ringing',
        recordingStatusCallback: '/api/twiml/status',
      });
      dial.number(to);

      // Log the outbound call
      await sql`
        INSERT INTO call_logs (agent_id, call_sid, direction, from_number, to_number, status)
        SELECT u.id, ${req.body.CallSid}, 'outbound', ${callerId}, ${to}, 'initiated'
        FROM users u WHERE u.username = ${identity}
      `;
    } else {
      // Client-to-client call
      const dial = twiml.dial();
      dial.client(to);
    }

    res.type('text/xml').send(twiml.toString());
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

    const rows = await sql`SELECT id, username FROM users WHERE twilio_number = ${inboundNumber} AND is_active = true`;

    if (!rows.length) {
      twiml.say('This number is not currently assigned to an agent. Please try again later.');
      return res.type('text/xml').send(twiml.toString());
    }

    const agent = rows[0];
    const dial = twiml.dial();
    dial.client(agent.username);

    // Log the inbound call
    await sql`
      INSERT INTO call_logs (agent_id, call_sid, direction, from_number, to_number, status)
      VALUES (${agent.id}, ${req.body.CallSid}, 'inbound', ${req.body.From}, ${inboundNumber}, 'ringing')
    `;

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
