// Minimal FCM HTTP v1 sender — no firebase-admin dependency. Signs a service
// account JWT with jsonwebtoken (already a dependency), exchanges it for an
// OAuth2 access token, and POSTs to the FCM v1 send endpoint.
//
// Requires env FIREBASE_SERVICE_ACCOUNT: the service-account JSON from
// Firebase Console → Project settings → Service accounts → Generate new
// private key. Raw JSON or base64 of it both work.

const jwt = require('jsonwebtoken');

let serviceAccount = null;
let warned = false;
let cachedAccessToken = null;
let cachedTokenExpiry = 0;

function getServiceAccount() {
  if (serviceAccount) return serviceAccount;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    if (!warned) {
      warned = true;
      console.warn('[fcm] FIREBASE_SERVICE_ACCOUNT not set — SMS push notifications disabled');
    }
    return null;
  }
  try {
    const json = raw.trim().startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf8');
    serviceAccount = JSON.parse(json);
    return serviceAccount;
  } catch (err) {
    if (!warned) {
      warned = true;
      console.error('[fcm] FIREBASE_SERVICE_ACCOUNT is not valid JSON/base64:', err.message);
    }
    return null;
  }
}

function isConfigured() {
  return !!getServiceAccount();
}

async function getAccessToken() {
  const sa = getServiceAccount();
  if (!sa) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && now < cachedTokenExpiry - 60) {
    return cachedAccessToken;
  }

  const assertion = jwt.sign(
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    sa.private_key,
    { algorithm: 'RS256' }
  );

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!resp.ok) {
    throw new Error(`OAuth token exchange failed (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
  }
  const data = await resp.json();
  cachedAccessToken = data.access_token;
  cachedTokenExpiry = now + (data.expires_in || 3600);
  return cachedAccessToken;
}

// Sends a high-priority data-only message to each token.
// Returns the list of tokens FCM reported as dead (unregistered/invalid)
// so the caller can prune them from the database.
async function sendToTokens(tokens, data) {
  const sa = getServiceAccount();
  if (!sa || !tokens.length) return [];

  const accessToken = await getAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  // FCM data values must all be strings
  const stringData = {};
  for (const [k, v] of Object.entries(data)) {
    if (v != null) stringData[k] = String(v);
  }

  const deadTokens = [];
  await Promise.all(tokens.map(async (token) => {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            data: stringData,
            android: { priority: 'HIGH' },
          },
        }),
      });
      if (!resp.ok) {
        const body = await resp.text();
        if (resp.status === 404 || body.includes('UNREGISTERED') || body.includes('INVALID_ARGUMENT')) {
          deadTokens.push(token);
        } else {
          console.warn(`[fcm] send failed (${resp.status}):`, body.slice(0, 200));
        }
      }
    } catch (err) {
      console.warn('[fcm] send error:', err.message);
    }
  }));

  return deadTokens;
}

module.exports = { isConfigured, sendToTokens };
