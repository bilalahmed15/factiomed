/**
 * Fix internal URLs in knowledge_chunks table
 * Updates internal://functiomed-contact to https://functiomed.ch
 */

import { db } from '../config/database.js';

console.log('Fixing internal URLs in knowledge_chunks...\n');

try {
  // Find all chunks with internal:// URLs
  const internalChunks = db.prepare(`
    SELECT id, url, page_title 
    FROM knowledge_chunks 
    WHERE url LIKE 'internal://%'
  `).all();

  console.log(`Found ${internalChunks.length} chunks with internal URLs:\n`);

  let updated = 0;
  for (const chunk of internalChunks) {
    console.log(`  - ${chunk.page_title || chunk.id}: ${chunk.url}`);
    
    // Update contact information chunks to use website URL
    if (chunk.url === 'internal://functiomed-contact') {
      db.prepare(`
        UPDATE knowledge_chunks 
        SET url = ? 
        WHERE id = ?
      `).run('https://functiomed.ch', chunk.id);
      console.log(`    ✓ Updated to: https://functiomed.ch`);
      updated++;
    } else {
      console.log(`    ⚠ Skipped (other internal URL type)`);
    }
  }

  console.log(`\n✅ Updated ${updated} chunks`);
  console.log(`⚠ Note: Other internal URLs (like internal://functiomed-content) are kept as-is since they don't have specific website pages.\n`);
} catch (error) {
  console.error('Error fixing URLs:', error);
  process.exit(1);
}

