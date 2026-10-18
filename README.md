# versi-ringan — AniVerse sync 1 jam (standalone)

Scraper ringan standalone langsung ke `https://otakudesu.blog/` — tanpa perantara `otakudesu-be`. Jalan per jam via Vercel Cron.

## Cara lokal
```bash
npm install
cp .env.example .env   # isi DATABASE_URL & CRON_SECRET
npm run build
npx tsx src/index.ts --dry-run --limit=25   # cek dulu (tanpa nulis DB)
node dist/index.js --once --window=60 --limit=25  # sync beneran
```

## Deploy Vercel (cron 1 jam)
`vercel.json` sudah `0 * * * *` → `GET /api/cron/sync?window=60` tiap jam 00.

Env di Vercel Dashboard → Settings → Environment Variables:
- `DATABASE_URL` (Supabase pooler 6543 `?pgbouncer=true`)
- `CRON_SECRET` (random 32 char)
- `SCAN_LIMIT=25` `WINDOW_MINUTES=60` (opsional)

## Mode ringan
- `limit 25` = 1 halaman (8-15 detik), cukup buat harian
- Kalau off lama: lokal `node dist/index.js --once --limit=50` sekali, lalu balikin cron 25/jam
