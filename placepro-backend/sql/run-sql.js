const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const files = [
    'schema.updated.sql',
    'migrations/20261121_batch_archive_metadata.sql',
    'seed-demo-students.sql',
    'seed-supplied-cse-rosters.sql',
    'seed.sql',
];



(async () => {
    const client = new Client({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'postgres',
    });

    try {
        await client.connect();
        for (const file of files) {
            const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
            console.log(`Running ${file} ...`);
            await client.query(sql); // multiple statements are fine without parameters
            console.log(`Done: ${file}`);
        }
        console.log('All SQL files executed successfully.');
    } catch (err) {
        console.error('Error:', err.message);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
})();
