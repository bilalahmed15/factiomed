import { initDb } from '../config/database.js';

async function main() {
  try {
    await initDb();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

main();
