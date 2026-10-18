// Vercel Cron handler — GET /api/cron/sync?window=60
// cek CRON_SECRET biar tidak bisa ditembak orang, plus vercel cron header

import { sync } from '../../sync.js';
import { config } from '../../config.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function isAuthorized(req: Request): boolean {
  if (!config.cronSecret) return true;
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${config.cronSecret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get('secret') === config.cronSecret) return true;
  const vercelCron = req.headers.get('x-vercel-cron');
  if (vercelCron) return true;
  return false;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized — CRON_SECRET salah' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const windowParam = Number(url.searchParams.get('window') ?? config.windowMinutes);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? config.scanLimit) || 25, 50);
  const dryRun = url.searchParams.get('dryRun') === 'true';

  try {
    const result = await sync({ window: windowParam, limit, dryRun });
    return new Response(JSON.stringify({ success: true, window: windowParam, ...result }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[cron/sync] fatal', e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
