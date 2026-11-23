'use strict';

const fs = require('node:fs');
const path = require('node:path');
const supabase = require('./supabase');

async function migrateUsers() {
  const { users } = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));
  let matched = 0;
  let skipped = 0;

  for (const user of users) {
    const email = user.email.toLowerCase();
    if (['customer@lokalbites.test', 'farmer@lokalbites.test'].includes(email)) {
      skipped++;
      continue;
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('legacy_id')
      .eq('email', email)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile || String(profile.legacy_id) !== String(user.id)) {
      skipped++;
      continue;
    }

    const { error } = await supabase
      .from('lokalbites_credentials')
      .upsert({
        email,
        password_salt: user.salt,
        password_hash: user.passwordHash
      }, { onConflict: 'email', ignoreDuplicates: true });

    if (error) throw error;
    matched++;
  }

  console.log(`Matched ${matched} account(s). Skipped ${skipped} demo or unmatched account(s).`);
}

migrateUsers().catch(error => {
  console.error('Migration failed:', error.code || error.message);
  process.exitCode = 1;
});
