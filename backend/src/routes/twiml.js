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

// Twilio's <Dial> action gives DialCallStatus values that differ slightly
// from call status values — normalize to what the app displays/filters on.
function normalizeDialStatus(dialCallStatus) {
  switch (dialCallStatus) {
    case 'answered':
    case 'completed':
      return 'completed';
    case 'no-answer':
      return 'no-answer';
    case 'busy':
      return 'busy';
    case 'canceled':
      return 'canceled';
    case 'failed':
    default:
      return 'failed';
  }
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
        recordingStatusCallback: `${base}/api/twiml/recording`,
        recordingStatusCallbackMethod: 'POST',
        action: `${base}/api/twiml/dial-complete`,
        method: 'POST',
        answerOnBridge: true,
        timeout: 30,
      });
      dial.number(to);

      // Respond first so the callee's phone starts ringing ASAP,
      // then log the call without blocking the webhook.
      res.type('text/xml').send(twiml.toString());

      if (identity) {
        sql`
          INSERT INTO call_logs (agent_id, call_sid, direction, from_number, to_number, status)
          SELECT u.id, ${req.body.CallSid}, 'outbound', ${callerId}, ${to}, 'initiated'
          FROM users u WHERE u.username = ${identity}
          ON CONFLICT (call_sid) DO NOTHING
        `.catch((err) => console.error('[twiml /voice] call log insert failed:', err));
      }
      return;
    }

    // Client-to-client call
    const dial = twiml.dial();
    dial.client(to);

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

    console.log('[twiml /inbound] CallSid=%s From=%s number=%s agents=%s',
      req.body.CallSid, req.body.From, inboundNumber, rows.map((r) => r.username).join(',') || 'NONE');

    if (!rows.length) {
      twiml.say('This number is not currently assigned to an agent. Please try again later.');
      return res.type('text/xml').send(twiml.toString());
    }

    const dial = twiml.dial({
      timeout: 25,
      answerOnBridge: true,
      action: `${base}/api/twiml/dial-complete`,
      method: 'POST',
    });
    // Ring all agents assigned to this number (handles multiple agents sharing a number)
    for (const agent of rows) {
      dial.client(agent.username);
    }

    // Respond immediately — Twilio only sends the incoming-call push to the
    // device after it gets this TwiML, so every ms here delays the ring.
    res.type('text/xml').send(twiml.toString());

    // Log the inbound call under the first matching agent (non-blocking)
    const agent = rows[0];
    sql`
      INSERT INTO call_logs (agent_id, call_sid, direction, from_number, to_number, status)
      VALUES (${agent.id}, ${req.body.CallSid}, 'inbound', ${req.body.From}, ${inboundNumber}, 'ringing')
      ON CONFLICT (call_sid) DO NOTHING
    `.catch((err) => console.error('[twiml /inbound] call log insert failed:', err));
  } catch (err) {
    console.error('TwiML inbound error:', err);
    const twiml = new VoiceResponse();
    twiml.say('An error occurred. Please try again.');
    res.type('text/xml').send(twiml.toString());
  }
});

// <Dial> action callback — fires when the dial attempt finishes.
// Carries DialCallStatus/DialCallDuration (NOT CallStatus/CallDuration) and
// MUST return TwiML: whatever we return continues the parent call.
router.post('/dial-complete', twilioWebhookMiddleware, async (req, res) => {
  const twiml = new VoiceResponse();
  try {
    const { CallSid, DialCallStatus, DialCallDuration, From } = req.body;
    const status = normalizeDialStatus(DialCallStatus);
    const duration = DialCallDuration ? parseInt(DialCallDuration, 10) : null;

    console.log('[twiml /dial-complete] CallSid=%s DialCallStatus=%s duration=%s',
      CallSid, DialCallStatus, DialCallDuration);

    if (CallSid) {
      await sql`
        UPDATE call_logs SET
          status = ${status},
          duration_sec = COALESCE(${duration}, duration_sec)
        WHERE call_sid = ${CallSid}
      `;
    }

    // If nobody answered, tell the caller. From starts with "client:" for
    // outbound calls placed by an agent; otherwise it's an inbound PSTN caller.
    if (['no-answer', 'busy', 'failed'].includes(status)) {
      const isAgentCaller = (From || '').startsWith('client:');
      twiml.say(
        isAgentCaller
          ? 'The call could not be completed.'
          : 'The agent is unavailable right now. Please try again later.'
      );
    }
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  } catch (err) {
    console.error('Dial-complete callback error:', err);
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  }
});

// Recording status callback — only touches the recording URL.
// (Previously this hit /status and wiped status/duration to unknown/null.)
router.post('/recording', twilioWebhookMiddleware, async (req, res) => {
  try {
    const { CallSid, RecordingUrl, RecordingStatus } = req.body;
    if (CallSid && RecordingUrl && (!RecordingStatus || RecordingStatus === 'completed')) {
      await sql`
        UPDATE call_logs SET recording_url = ${RecordingUrl}
        WHERE call_sid = ${CallSid}
      `;
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('Recording callback error:', err);
    res.sendStatus(200);
  }
});

// Generic status callback — kept for backward compatibility with any TwiML
// still in flight. Only updates fields actually present in the request so a
// recording-only or partial callback can never null out good data.
router.post('/status', twilioWebhookMiddleware, async (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration, RecordingUrl, DialCallStatus, DialCallDuration } = req.body;

    const status = DialCallStatus ? normalizeDialStatus(DialCallStatus) : (CallStatus || null);
    const rawDuration = DialCallDuration || CallDuration;
    const duration = rawDuration ? parseInt(rawDuration, 10) : null;

    if (CallSid) {
      await sql`
        UPDATE call_logs SET
          status = COALESCE(${status}, status),
          duration_sec = COALESCE(${duration}, duration_sec),
          recording_url = COALESCE(${RecordingUrl || null}, recording_url)
        WHERE call_sid = ${CallSid}
      `;
    }

    // Valid empty TwiML — this endpoint may be hit as a <Dial> action by
    // in-flight calls, and Twilio errors on non-XML action responses.
    const twiml = new VoiceResponse();
    res.type('text/xml').send(twiml.toString());
  } catch (err) {
    console.error('Status callback error:', err);
    const twiml = new VoiceResponse();
    res.type('text/xml').send(twiml.toString());
  }
});

module.exports = router;
