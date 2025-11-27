import { crawlSite } from '../services/crawler.js';
import dotenv from 'dotenv';

dotenv.config();

const siteUrl = process.argv[2] || process.env.TARGET_SITE || 'https://functiomed.ch';

console.log(`Starting crawl of ${siteUrl}...`);
console.log('This may take several minutes depending on the site size...\n');

crawlSite(siteUrl)
  .then(result => {
    console.log('\n✅ Crawl completed successfully!');
    console.log(`Pages crawled: ${result.pages}`);
    console.log(`Chunks stored: ${result.chunks}`);
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Crawl failed:', error);
    process.exit(1);
  });

