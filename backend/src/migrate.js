const sql = require('./db');

async function migrate() {
  console.log('Running migrations...');

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name VARCHAR(100) NOT NULL,
      twilio_number VARCHAR(20),
      is_active BOOLEAN DEFAULT true,
      is_admin BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log('  ✓ users table');

  await sql`
    CREATE TABLE IF NOT EXISTS call_logs (
      id SERIAL PRIMARY KEY,
      agent_id INT REFERENCES users(id),
      call_sid VARCHAR(50) UNIQUE,
      direction VARCHAR(10),
      from_number VARCHAR(20),
      to_number VARCHAR(20),
      duration_sec INT,
      status VARCHAR(20),
      recording_url TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log('  ✓ call_logs table');

  await sql`
    CREATE TABLE IF NOT EXISTS contacts (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      phone VARCHAR(20) NOT NULL,
      company VARCHAR(100),
      email VARCHAR(100),
      status VARCHAR(30) DEFAULT 'new',
      notes TEXT,
      assigned_to INT REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  console.log('  ✓ contacts table');

  console.log('Migrations complete.');
}

module.exports = migrate;
