const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function deploy() {
  console.log('Deploying to Supabase Storage...');

  const projectRef = 'vdbmhqlogqrxozaibntq';
  const supabaseUrl = `https://${projectRef}.supabase.co`;
  const bucketName = process.env.SUPABASE_BUCKET || 'sdk';
  
  // Get access token from Supabase CLI
  let accessToken;
  try {
    const result = execSync('npx supabase status --output json', { 
      encoding: 'utf8',
      cwd: __dirname 
    });
    // If local is running, we need to use the anon key or service key from env
    accessToken = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_SERVICE_KEY;
    if (!accessToken) {
      console.error('Error: SUPABASE_ACCESS_TOKEN or SUPABASE_SERVICE_KEY required');
      console.error('Set it with: $env:SUPABASE_ACCESS_TOKEN="your-token-here"');
      process.exit(1);
    }
  } catch (err) {
    // Not using local supabase, need token
    accessToken = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_SERVICE_KEY;
    if (!accessToken) {
      console.error('Error: SUPABASE_ACCESS_TOKEN or SUPABASE_SERVICE_KEY required');
      console.error('Set it with: $env:SUPABASE_ACCESS_TOKEN="your-token-here"');
      process.exit(1);
    }
  }
  
  // Generate timestamp for versioning (DD-MM-YY-HHMMSS)
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${day}-${month}-${year}-${hours}${minutes}${seconds}`;
  
  const latestFileName = 'divee.sdk.latest.js';
  const versionedFileName = `divee.sdk.${timestamp}.js`;

  // Read the built file
  const filePath = path.join(__dirname, 'dist', 'divee.sdk.v1.js');
  if (!fs.existsSync(filePath)) {
    console.error(`Error: Built file not found at ${filePath}`);
    console.error('Run "npm run build" first.');
    process.exit(1);
  }

  const fileSize = fs.statSync(filePath).size;
  console.log(`File size: ${(fileSize / 1024).toFixed(2)} KB`);

  try {
    // Upload versioned file using curl
    console.log(`Uploading versioned file: ${versionedFileName}`);
    const versionedUrl = `${supabaseUrl}/storage/v1/object/${bucketName}/${versionedFileName}`;
    execSync(`curl -X POST "${versionedUrl}" -H "Authorization: Bearer ${accessToken}" -H "Content-Type: application/javascript" -H "x-upsert: true" --data-binary "@${filePath}"`, {
      stdio: 'inherit',
      cwd: __dirname,
      shell: 'powershell.exe'
    });
    console.log(`✓ Versioned file uploaded`);
    
    // Upload latest file using curl
    console.log(`Uploading latest file: ${latestFileName}`);
    const latestUrl = `${supabaseUrl}/storage/v1/object/${bucketName}/${latestFileName}`;
    execSync(`curl -X POST "${latestUrl}" -H "Authorization: Bearer ${accessToken}" -H "Content-Type: application/javascript" -H "x-upsert: true" --data-binary "@${filePath}"`, {
      stdio: 'inherit',
      cwd: __dirname,
      shell: 'powershell.exe'
    });
    console.log(`✓ Latest file updated`);
      stdio: 'inherit',
      cwd: __dirname 
    });
    console.log(`✓ Latest file updated`);
    
    console.log('\n✓ Deploy complete!');
    console.log(`Version: ${versionedFileName}`);
  } catch (err) {
    console.error('Deploy failed:', err.message);
    process.exit(1);
  }
}

deploy().catch((err) => {
  console.error(err);
  process.exit(1);
});
