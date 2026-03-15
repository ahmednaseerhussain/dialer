const twilio = require('twilio');

function twilioWebhookMiddleware(req, res, next) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.headers['x-twilio-signature'];
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  if (!signature) {
    return res.status(403).json({ error: 'Missing Twilio signature' });
  }

  const isValid = twilio.validateRequest(authToken, signature, url, req.body);
  if (!isValid) {
    return res.status(403).json({ error: 'Invalid Twilio signature' });
  }

  next();
}

module.exports = { twilioWebhookMiddleware };
