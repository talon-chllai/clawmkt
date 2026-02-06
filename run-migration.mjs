import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use environment variable - NEVER commit credentials!
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Error: DATABASE_URL environment variable is not set');
  console.error('Add DATABASE_URL to .env.local with your Supabase connection string');
  process.exit(1);
}

async function runMigration() {
  const client = new pg.Client({ connectionString });
  
  try {
    console.log('Connecting to database...');
    await client.connect();
    
    console.log('Reading migration file...');
    const sqlPath = path.join(__dirname, 'supabase', 'migrations', '001_initial_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Running migration...');
    await client.query(sql);
    
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration error:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.hint) console.error('Hint:', err.hint);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
