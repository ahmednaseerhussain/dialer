require('dotenv').config();
const express = require('express');
const cors = require('cors');
const migrate = require('./migrate');
const sql = require('./db');

const authRoutes = require('./routes/auth');
const tokenRoutes = require('./routes/token');
const twimlRoutes = require('./routes/twiml');
const callRoutes = require('./routes/calls');
const contactRoutes = require('./routes/contacts');
const adminRoutes = require('./routes/admin');
const locationRoutes = require('./routes/location');
const messageRoutes = require('./routes/messages');

const app = express();

// Trust proxy headers (Render.com, Heroku, etc.)
app.set('trust proxy', 1);

// CORS — restrict to your app's origin in production
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
}));

// Parse URL-encoded bodies (Twilio webhooks send form data)
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/token', tokenRoutes);
app.use('/api/twiml', twimlRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/messages', messageRoutes);

// Health check — also touches the DB so keep-alive pings keep Neon warm
// (a suspended DB adds seconds to the inbound-call webhook = late ringing)
app.get('/health', async (req, res) => {
  let db = 'ok';
  try {
    await sql`SELECT 1`;
  } catch {
    db = 'error';
  }
  res.json({ status: 'ok', db });
});

const PORT = process.env.PORT || 3000;

// Keep Render free-tier alive by pinging /health every 14 minutes
function startKeepAlive() {
  const url = process.env.RENDER_EXTERNAL_URL;
  if (!url) return;
  setInterval(async () => {
    try {
      await fetch(`${url}/health`);
      console.log('Keep-alive ping sent');
    } catch (err) {
      console.warn('Keep-alive ping failed:', err.message);
    }
  }, 14 * 60 * 1000);
}

// Neon free tier suspends compute after ~5 min idle; the first query after
// that takes seconds — which delays the inbound-call TwiML and makes phones
// ring late. Ping the DB every 4 min to keep it awake. Set DB_KEEPALIVE=false
// to save Neon compute hours if late first rings are acceptable.
function startDbKeepAlive() {
  if (process.env.DB_KEEPALIVE === 'false') return;
  setInterval(() => {
    sql`SELECT 1`.catch((err) => console.warn('DB keep-alive failed:', err.message));
  }, 4 * 60 * 1000);
}

async function start() {
  try {
    await migrate();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      startKeepAlive();
      startDbKeepAlive();
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
