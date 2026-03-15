const jwt = require('jsonwebtoken');
const sql = require('../db');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const rows = await sql`SELECT id, username, full_name, twilio_number, is_active, is_admin FROM users WHERE id = ${payload.userId}`;
    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ error: 'User not found or disabled' });
    }
    req.user = rows[0];
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { authMiddleware, adminMiddleware };
