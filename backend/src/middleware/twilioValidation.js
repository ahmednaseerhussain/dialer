const twilio = require('twilio');

function twilioWebhookMiddleware(req, res, next) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.headers['x-twilio-signature'];

  // Use the full public URL that Twilio signs against.
  // With 'trust proxy' enabled, req.protocol correctly reads X-Forwarded-Proto.
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  if (!signature) {
    console.error('TwiML validation: Missing X-Twilio-Signature header');
    return res.status(403).json({ error: 'Missing Twilio signature' });
  }

  const isValid = twilio.validateRequest(authToken, signature, url, req.body);
  if (!isValid) {
    console.error('TwiML validation failed. URL used:', url);
    return res.status(403).json({ error: 'Invalid Twilio signature' });
  }

  next();
}

module.exports = { twilioWebhookMiddleware };
