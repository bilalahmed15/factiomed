# Testing the Crawler

The crawler should now have better debugging. Run:

```bash
cd backend
npm run crawl
```

Watch the output - it should show:
1. How many URLs were found
2. Detailed extraction info for each page
3. What content was extracted

If you see "Crawled 0 pages", the issue is likely:
- Pages are being fetched but content extraction is failing
- The while loop isn't executing

Check the console output for clues!



