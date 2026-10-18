// VPS runner — bisa jalan sekali (--once) atau cron tiap 30 menit
// pakai: npm run sync  (sekali) | node dist/index.js (cron tiap 30m) | pm2 start ecosystem.config.js

import { sync } from './sync.js';
import { config, assertConfig } from './config.js';

const args = process.argv.slice(2);
const isOnce = args.includes('--once');
const isDryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const windowArg = args.find(a => a.startsWith('--window='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : config.scanLimit;
const win = windowArg ? Number(windowArg.split('=')[1]) : config.windowMinutes;

async function runOnce() {
  assertConfig();
  console.log(`[versi-ringan] sync start window=${win} limit=${limit} dryRun=${isDryRun}`);
  const res = await sync({ window: win, limit, dryRun: isDryRun });
  console.log(`[versi-ringan] done`, JSON.stringify(res, null, 2));
  if (isDryRun || isOnce) process.exit(0);
}

if (isOnce || isDryRun) {
  runOnce().catch(e => { console.error(e); process.exit(1); });
} else {
  // mode cron VPS — jalan tiap 60 menit (standalone, tanpa otakudesu-be)
  // fallback ringan tanpa node-cron biar tanpa deps tambahan
  assertConfig();
  console.log(`[versi-ringan] cron mode: tiap 60 menit (window ${win} menit), limit ${limit}. Tekan Ctrl+C untuk stop.`);
  const ms = 60 * 60 * 1000;
  runOnce().catch(console.error);
  setInterval(() => {
    runOnce().catch(console.error);
  }, ms);
}
