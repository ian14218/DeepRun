const { Pool } = require('pg');
require('dotenv').config();

const connectionString =
  process.env.NODE_ENV === 'test'
    ? process.env.DATABASE_URL_TEST
    : process.env.DATABASE_URL;

const poolConfig = { connectionString };

// Enable SSL for production databases (e.g. Railway, Supabase, Neon).
// Most managed PostgreSQL providers require SSL but use self-signed certs,
// so rejectUnauthorized must be false.
if (process.env.NODE_ENV === 'production') {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

module.exports = pool;
