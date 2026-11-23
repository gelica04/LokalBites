
'use strict';

const fs = require('fs');
const path = require('path');
const supabase = require('./supabase');


async function migrateUsers() {
  const filePath = path.join(__dirname, 'data.json');

  const database = JSON.parse(
    fs.readFileSync(filePath, 'utf8')
  );

  const users = database.users.map((u) => ({
    legacy_id: String(u.id),
    name: u.name,
    email: u.email.toLowerCase(),
    role: u.role
  }));

  if (!users.length) {
    console.log('No users to migrate.');
    return;
  }

  const { data, error } = await supabase
    .from('users')
    .upsert(users, {
      onConflict: 'legacy_id'
    })
    .select('id, name, role');

  if (error) {
    throw new Error(error.message);
  }

  console.log(
    `Successfully migrated ${data.length} user profiles!`
  );
}

migrateUsers().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
});
