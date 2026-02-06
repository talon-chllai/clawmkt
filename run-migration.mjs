import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = 'postgresql://postgres.plybhpuupjwsnziupjxx:ftYvaGT9F1hylOAz@aws-0-us-west-2.pooler.supabase.com:5432/postgres';

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
