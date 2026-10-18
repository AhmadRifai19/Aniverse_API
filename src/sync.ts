// inti cron ringan — intip 25 terbaru tiap 60 menit (per jam), window 60 menit
// update bukan ganti: kalau sudah ada -> update tipis, belum ada -> insert
// paling ringan: tanpa fetch stream_url (lazy video pas play), enrich cuma kalau perlu

import { prisma } from './db.js';
import { config } from './config.js';
import { searchJikanByTitle, normalizeStatus } from './jikan.js';
import { fetchOngoingPage, fetchAnimeDetail } from './otakudesu.js';

function slugToMalId(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    const c = slug.charCodeAt(i);
    h = (h << 5) - h + c;
    h |= 0;
  }
  return Math.abs(h) % 2_000_000_000;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function isStale(updatedAt: Date, days = 7): boolean {
  return Date.now() - updatedAt.getTime() > days * 24 * 60 * 60 * 1000;
}

function cleanOtakuGenres(raw: { name: string; slug: string }[] | undefined): string[] {
  if (!raw) return [];
  return raw
    .map(g => (g.name ?? '').trim())
    .filter(g => g && g.length > 1 && g !== ' ')
    .map(g => g.charAt(0).toUpperCase() + g.slice(1))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 8);
}

export interface SyncOptions {
  window?: number;
  limit?: number;
  dryRun?: boolean;
  enrich?: boolean;
}

export interface SyncResult {
  scanned: number;
  checked: number;
  inserted: number;
  updated: number;
  skipped: number;
  enriched: number;
  db_total: number;
  withGenre: number;
  byStatus: { status: string; count: number }[];
  durationMs: number;
  dryRun: boolean;
}

export async function sync(opts: SyncOptions = {}): Promise<SyncResult> {
  const t0 = Date.now();
  const limit = Math.min(opts.limit ?? config.scanLimit, 50);
  const doEnrich = opts.enrich ?? true;
  const dryRun = !!opts.dryRun;

  // 1. ambil etalase terbaru — cuma 1-2 halaman biar ringan (25 = 1 halaman paling ringan)
  const pagesNeeded = Math.ceil(limit / 25);
  const allItems: { title?: string; slug?: string; poster?: string }[] = [];
  for (let p = 1; p <= pagesNeeded; p++) {
    const items = await fetchOngoingPage(p);
    if (!items.length) break;
    allItems.push(...items);
    if (allItems.length >= limit) break;
  }
  const scanned = Math.min(allItems.length, limit);
  const slice = allItems.slice(0, limit);

  // 2. ambil snapshot DB sekali — ringan, tanpa episode detail dulu
  const dbAnimes = await prisma.anime.findMany({
    select: { id: true, mal_id: true, genres: true, status: true, updatedAt: true, score: true },
  });
  const dbMap = new Map<number, typeof dbAnimes[number]>(dbAnimes.map(a => [a.mal_id, a]));
  // episode count per anime — satu query groupBy biar nggak N+1
  const epCounts = await prisma.episode.groupBy({ by: ['animeId'], _count: { _all: true } });
  const epCountMap = new Map<number, number>(epCounts.map(e => [e.animeId, e._count._all]));
  const idToMal = new Map<number, number>(dbAnimes.map(a => [a.id, a.mal_id]));
  // reverse lookup animeId -> db entry
  const animeIdToEntry = new Map<number, typeof dbAnimes[number]>();
  for (const a of dbAnimes) animeIdToEntry.set(a.id, a);

  let checked = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let enriched = 0;

  for (const item of slice) {
    if (!item.slug) { skipped++; continue; }
    checked++;
    const malId = slugToMalId(item.slug);
    const existing = dbMap.get(malId);

    // fetch detail — ini yang paling ringan (tanpa stream_url)
    const detail = await fetchAnimeDetail(item.slug);
    if (!detail) { skipped++; continue; }

    const dbEpisodeCount = existing ? (epCountMap.get(existing.id) ?? 0) : 0;
    const remoteEpisodeCount = detail.episode_lists?.length ?? 0;

    // kalau sudah ada & episode count sama & genres sudah keisi & update belum 7 hari -> skip biar super ringan
    const needDetailUpdate = !existing
      || dbEpisodeCount !== remoteEpisodeCount
      || !existing.genres?.length
      || !existing.status
      || isStale(existing.updatedAt, 7);

    if (!needDetailUpdate && existing) {
      skipped++;
      continue;
    }

    // enrich cuma kalau perlu — biar nggak kena rate limit tiap 30 menit
    let meta: Awaited<ReturnType<typeof searchJikanByTitle>> = null;
    const shouldEnrich = doEnrich && (!existing || !existing.genres?.length || !existing.status || isStale(existing.updatedAt, 7));
    if (shouldEnrich) {
      const titleForSearch = detail.title ?? item.title ?? '';
      if (titleForSearch) {
        meta = await searchJikanByTitle(titleForSearch);
        if (meta) enriched++;
        await sleep(380);
      }
    } else if (existing && existing.genres?.length) {
      // sudah akurat, skip enrich
    }

    const otakuGenres = cleanOtakuGenres(detail.genres as any);
    const finalTitle = detail.title ?? item.title ?? 'Unknown';
    const finalSynopsis = (meta?.synopsis && meta.synopsis.length > 20)
      ? meta.synopsis
      : (detail.synopsis && detail.synopsis.length > 20 ? detail.synopsis : 'Tidak ada sinopsis.');
    const finalScore = (meta?.score != null && meta.score > 0) ? meta.score : (parseFloat(detail.rating ?? '0') || 0);
    const finalGenres = (meta?.genres && meta.genres.length > 0) ? meta.genres : otakuGenres;
    const finalStudio = meta?.studio ?? (detail.studio && detail.studio !== '-' ? detail.studio : null);
    const finalYear = meta?.year ?? null;
    const finalType = meta?.type ?? (detail as any).type ?? 'TV';
    const finalStatus = normalizeStatus(meta?.status ?? detail.status ?? 'Unknown');

    if (dryRun) {
      if (!existing) inserted++;
      else updated++;
      continue;
    }

    // upsert anime — update bukan ganti, tanpa hapus episode lama
    let animeId: number;
    try {
      const up = await prisma.anime.upsert({
        where: { mal_id: malId },
        update: {
          title: finalTitle,
          image_url: detail.poster ?? item.poster ?? '',
          synopsis: finalSynopsis,
          score: finalScore,
          status: finalStatus,
          genres: finalGenres,
          studio: finalStudio,
          year: finalYear,
          type: finalType,
        },
        create: {
          mal_id: malId,
          title: finalTitle,
          image_url: detail.poster ?? item.poster ?? '',
          synopsis: finalSynopsis,
          score: finalScore,
          status: finalStatus,
          genres: finalGenres,
          studio: finalStudio,
          year: finalYear,
          type: finalType,
        },
      });
      animeId = up.id;
      if (!existing) inserted++;
      else updated++;
      // refresh map biar count berikutnya akurat
      dbMap.set(malId, { id: up.id, mal_id: malId, genres: finalGenres, status: finalStatus, updatedAt: new Date(), score: finalScore } as any);
    } catch (e) {
      console.warn(`[sync] upsert anime fail ${item.slug}`, e);
      skipped++;
      continue;
    }

    // episode — lazy: cuma slug + title + episode_no, TANPA stream_url
    const epLists = detail.episode_lists ?? [];
    // deteksi episode baru biar bisa notify watcher
    // simpen sebelum upsert biar tau mana yang benar-benar baru
    const newEpisodeNos: number[] = [];
    for (const ep of epLists) {
      if (!ep.slug) continue;
      // cek apakah slug ini sudah ada di DB (Episode.slug unique)
      const existsEp = await prisma.episode.findUnique({ where: { slug: ep.slug }, select: { id: true } }).catch(() => null);
      const isNew = !existsEp;
      try {
        await prisma.episode.upsert({
          where: { slug: ep.slug },
          update: { title: ep.episode ?? `Episode ${ep.episode_number}`, episode_no: ep.episode_number ?? 0 },
          create: { animeId, episode_no: ep.episode_number ?? 0, title: ep.episode ?? `Episode ${ep.episode_number}`, slug: ep.slug },
        });
        if (isNew && !dryRun) newEpisodeNos.push(ep.episode_number ?? 0);
      } catch {}
    }

    // kalau ada episode baru & bukan dryRun → notify user yang watchlist-nya ada anime ini
    // (hormati pref notifEpisode)
    if (newEpisodeNos.length > 0 && !dryRun) {
      try {
        const watchers = await prisma.user.findMany({ select: { id: true, watchlist: true, notifEpisode: true } });
        const targets = watchers.filter(u => u.watchlist.includes(String(animeId)) && u.notifEpisode);
        if (targets.length > 0) {
          const newestEp = Math.max(...newEpisodeNos);
          const epLabel = newEpisodeNos.length === 1 ? `Episode ${newEpisodeNos[0]}` : `${newEpisodeNos.length} episode baru`;
          for (const u of targets) {
            try {
              await prisma.notification.create({
                data: {
                  userId: u.id,
                  type: 'NEW_EPISODE',
                  title: `${finalTitle} — ${epLabel}`,
                  body: `Ada update: Ep ${newestEp} baru tersedia. Buka untuk nonton sekarang.`,
                  animeId,
                },
              });
            } catch {}
          }
        }
      } catch (e) {
        console.warn(`[sync] notify fail ${finalTitle}`, e);
      }
    }

    await sleep(120);
  }

  const db_total = dryRun ? dbAnimes.length : await prisma.anime.count();
  const withGenre = dryRun ? dbAnimes.filter(a => a.genres?.length).length : await prisma.anime.count({ where: { genres: { isEmpty: false } } as any });
  const grouped = dryRun ? [] : await prisma.anime.groupBy({ by: ['status'], _count: true } as any);
  const byStatus = grouped.map((g: any) => ({ status: g.status ?? 'Unknown', count: g._count }));

  return {
    scanned,
    checked,
    inserted,
    updated,
    skipped,
    enriched,
    db_total,
    withGenre,
    byStatus,
    durationMs: Date.now() - t0,
    dryRun,
  };
}
