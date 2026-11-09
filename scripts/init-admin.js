require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

async function initialize() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password || password === 'change_this_password' || password.length < 12) {
    console.error('Set ADMIN_USERNAME and a unique ADMIN_PASSWORD of at least 12 characters in .env.');
    process.exitCode = 1;
    return;
  }
  const dataDir = path.join(__dirname, '..', 'data');
  const adminFile = path.join(dataDir, 'admin.json');
  if (fs.existsSync(adminFile)) {
    console.error('An admin account already exists. Initialization will not overwrite it.');
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const passwordHash = await bcrypt.hash(password, 12);
  fs.writeFileSync(adminFile, JSON.stringify({ username, passwordHash }, null, 2), { flag: 'wx' });
  console.log(`Admin account "${username}" initialized. Keep your .env file private.`);
}

initialize().catch(error => {
  console.error('Could not initialize admin account:', error.message);
  process.exitCode = 1;
});