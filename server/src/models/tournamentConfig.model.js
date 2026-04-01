const pool = require('../db');

const DEFAULT_BRACKET_LAYOUT = { left: ['East', 'West'], right: ['South', 'Midwest'] };

async function getConfig(key) {
  const result = await pool.query(
    `SELECT value FROM tournament_config WHERE key = $1`,
    [key]
  );
  return result.rows[0]?.value || null;
}

async function setConfig(key, value, description) {
  await pool.query(
    `INSERT INTO tournament_config (key, value, description)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value, description || null]
  );
}

async function getAllConfig() {
  const result = await pool.query(`SELECT key, value, description FROM tournament_config ORDER BY key`);
  return result.rows;
}

async function getBracketLayout() {
  const raw = await getConfig('bracket_layout');
  if (!raw) return DEFAULT_BRACKET_LAYOUT;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.left?.length === 2 && parsed.right?.length === 2) return parsed;
    return DEFAULT_BRACKET_LAYOUT;
  } catch {
    return DEFAULT_BRACKET_LAYOUT;
  }
}

module.exports = { getConfig, setConfig, getAllConfig, getBracketLayout, DEFAULT_BRACKET_LAYOUT };
