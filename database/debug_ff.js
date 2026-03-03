require('dotenv').config({ path: `${__dirname}/../server/.env` });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function test() {
  const { rows: allTeams } = await pool.query('SELECT * FROM tournament_teams ORDER BY region, seed');
  const active = allTeams.filter(t => t.is_eliminated === false);
  console.log('Total teams:', allTeams.length, '| Active:', active.length);

  const ffTeams = allTeams.filter(t => t.is_first_four === true);
  console.log('FF teams:', ffTeams.length);

  // Reproduce buildBracketMatchups roundNum===0 logic
  const matchups = [];
  const seen = new Set();
  for (const team of allTeams) {
    if (team.is_first_four && team.is_eliminated === false && !seen.has(team.id)) {
      const partner = allTeams.find(t => t.id === team.first_four_partner_id);
      console.log(`\n${team.name} (id: ${team.id})`);
      console.log(`  partner_id: ${team.first_four_partner_id}`);
      console.log(`  partner found: ${partner ? partner.name : 'NOT FOUND'}`);
      if (partner) {
        console.log(`  partner.id: ${partner.id}`);
        console.log(`  strict equal: ${team.first_four_partner_id === partner.id}`);
        console.log(`  partner eliminated: ${partner.is_eliminated}`);
      }
      if (partner && partner.is_eliminated === false) {
        matchups.push({ a: team.name, b: partner.name });
        seen.add(team.id);
        seen.add(partner.id);
      }
    }
  }
  console.log('\nTotal matchups:', matchups.length);
  matchups.forEach(m => console.log(`  ${m.a} vs ${m.b}`));
  await pool.end();
}
test();
