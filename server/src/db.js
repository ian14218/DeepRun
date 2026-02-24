const { Pool } = require('pg');
require('dotenv').config();

const connectionString =
  process.env.NODE_ENV === 'test'
    ? process.env.DATABASE_URL_TEST
    : process.env.DATABASE_URL;

const pool = new Pool({ connectionString });

module.exports = pool;
