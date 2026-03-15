require('dotenv').config();
const express = require('express');
const cors = require('cors');
const migrate = require('./migrate');

const authRoutes = require('./routes/auth');
const tokenRoutes = require('./routes/token');
const twimlRoutes = require('./routes/twiml');
const callRoutes = require('./routes/calls');
const contactRoutes = require('./routes/contacts');
const adminRoutes = require('./routes/admin');

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

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await migrate();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
