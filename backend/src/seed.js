require('dotenv').config();
const bcrypt = require('bcryptjs');
const sql = require('./db');

async function seed() {
  const username = 'admin';
  const password = 'Admin@123456';
  const full_name = 'System Admin';

  const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
  if (existing.length) {
    console.log('Admin user already exists.');
    return;
  }

  const password_hash = await bcrypt.hash(password, 10);
  await sql`
    INSERT INTO users (username, password_hash, full_name, is_admin)
    VALUES (${username}, ${password_hash}, ${full_name}, true)
  `;
  console.log(`Admin user created: username="${username}", password="${password}"`);
  console.log('⚠️  Change this password immediately after first login!');
}

seed().catch(console.error);
