const twilio = require('twilio');

function twilioWebhookMiddleware(req, res, next) {
  // Allow disabling validation for debugging — set TWILIO_SKIP_VALIDATION=true
  if (process.env.TWILIO_SKIP_VALIDATION === 'true') {
    console.warn('[twilio] webhook validation SKIPPED (TWILIO_SKIP_VALIDATION=true)');
    return next();
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.headers['x-twilio-signature'];

  // Twilio signs the public URL it was configured with. Prefer the explicit
  // RENDER_EXTERNAL_URL to avoid proxy/protocol mismatches on platforms like Render.
  const externalBase = (process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const url = externalBase
    ? `${externalBase}${req.originalUrl}`
    : `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  if (!signature) {
    console.error('[twilio] Missing X-Twilio-Signature header. URL:', url);
    return res.status(403).json({ error: 'Missing Twilio signature' });
  }

  const isValid = twilio.validateRequest(authToken, signature, url, req.body);
  if (!isValid) {
    console.error('[twilio] signature validation failed.');
    console.error('  URL used :', url);
    console.error('  signature:', signature);
    console.error('  body keys:', Object.keys(req.body || {}));
    return res.status(403).json({ error: 'Invalid Twilio signature' });
  }

  next();
}

module.exports = { twilioWebhookMiddleware };
