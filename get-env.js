const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

try {
  console.log('Pulling Vercel prod environment...');
  execSync('"C:\\Program Files\\nodejs\\npx.cmd" vercel env pull tmp/.env.prod --yes --environment production', {
    cwd: process.cwd(),
    stdio: 'pipe'
  });
  
  const env = fs.readFileSync(path.join(process.cwd(), 'tmp/.env.prod'), 'utf8');
  const uri = env.split('\n').find(l => l.startsWith('MONGODB_URI='));
  if (uri) {
    console.log(uri);
  } else {
    console.error('MONGODB_URI not found in env');
  }
  
  process.exit(0);
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
