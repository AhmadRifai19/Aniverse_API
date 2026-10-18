import { normalizeGenres } from './genres.js';

const CACHE = new Map<string, JikanResult | null>();

export interface JikanResult {
  synopsis: string | null;
  score: number | null;
  genres: string[];
  studio: string | null;
  year: number | null;
  type: string | null;
  status: string | null;
}

// bersihin embel-embel biar gampang ketemu di database luar
// "Kusuriya S3 Sub Indo" -> "Kusuriya no Hitorigoto"
function cleanSynopsis(raw: string | null): string | null {
  if (!raw) return raw;
  let s = raw.trim();
  const patterns = [
    /\n*\(\s*Source\s*:[^)]+\)\s*$/i,
    /\n*\[\s*Source\s*:[^\]]+\]\s*$/i,
    /\n*\[\s*Written by MAL Rewrite\s*\]\s*$/i,
    /\s*\(Source:[^)]+\)\s*$/i,
  ];
  let prev: string;
  do {
    prev = s;
    for (const re of patterns) s = s.replace(re, '').trim();
  } while (s !== prev);
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s || null;
}

export function normalizeStatus(raw: string | null | undefined): 'Ongoing' | 'Completed' | 'Upcoming' {
  if (!raw) return 'Ongoing';
  const s = raw.toLowerCase().trim();
  if (s.includes('not yet') || s.includes('upcoming') || s.includes('tba') || s.includes('belum tayang') || s === 'upcoming') return 'Upcoming';
  if (s.includes('finished') || s.includes('completed') || s.includes('ended') || s.includes('tamat') || s.includes('selesai')) return 'Completed';
  if (s.includes('currently') || s.includes('releasing') || s.includes('ongoing') || s.includes('airing') || s.includes('sedang tayang')) return 'Ongoing';
  if (s === 'ongoing') return 'Ongoing';
  if (s === 'completed' || s === 'finished') return 'Completed';
  return 'Ongoing';
}

export function cleanTitle(raw: string): string {
  let s = raw.trim();
  s = s.replace(/\s*-\s*Sub Indo.*$/i, '');
  s = s.replace(/\s+Sub Indo.*$/i, '');
  s = s.replace(/\s+Season\s+\d+.*$/i, '');
  s = s.replace(/\s+S\d+.*$/i, '');
  s = s.replace(/\s*\(\d{4}\).*$/, '');
  s = s.replace(/\s*☆.*$/, '');
  s = s.replace(/\s*★.*$/, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s || raw.trim();
}

async function searchJikan(title: string): Promise<JikanResult | null> {
  const clean = cleanTitle(title);
  const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(clean)}&limit=3&sfw&order_by=popularity&sort=asc`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      if (res.status === 429) await new Promise(r => setTimeout(r, 1200));
      return null;
    }
    const json = await res.json();
    const list: any[] = json?.data ?? [];
    if (list.length === 0) return null;
    const lowerClean = clean.toLowerCase();
    let best = list[0];
    for (const item of list) {
      const t = String(item.title ?? '').toLowerCase();
      const tEn = String(item.title_english ?? '').toLowerCase();
      if (t === lowerClean || tEn === lowerClean) { best = item; break; }
      if (t.includes(lowerClean) || lowerClean.includes(t)) best = item;
    }
    return {
      synopsis: cleanSynopsis(best.synopsis ?? null),
      score: typeof best.score === 'number' ? best.score : null,
      genres: normalizeGenres((best.genres ?? []).map((g: any) => g.name).filter(Boolean)),
      studio: best.studios?.[0]?.name ?? null,
      year: best.year ?? best.aired?.prop?.from?.year ?? null,
      type: best.type ?? null,
      status: normalizeStatus(best.status ?? null),
    };
  } catch { return null; }
}

async function searchAniList(title: string): Promise<JikanResult | null> {
  const clean = cleanTitle(title);
  const query = `query($search:String){Media(search:$search,type:ANIME){title{romaji english} description averageScore genres seasonYear type status studios{nodes{name}}}}`;
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { search: clean } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const m = json?.data?.Media;
    if (!m) return null;
    const rawDesc: string | null = m.description ?? null;
    const synopsis = rawDesc ? cleanSynopsis(rawDesc.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim()) : null;
    return {
      synopsis,
      score: m.averageScore ? m.averageScore / 10 : null,
      genres: normalizeGenres((m.genres ?? []).filter(Boolean)),
      studio: m.studios?.nodes?.[0]?.name ?? null,
      year: m.seasonYear ?? null,
      type: m.type ?? null,
      status: normalizeStatus(m.status ?? null),
    };
  } catch { return null; }
}

export async function searchJikanByTitle(title: string): Promise<JikanResult | null> {
  const key = cleanTitle(title).toLowerCase();
  if (CACHE.has(key)) return CACHE.get(key)!;
  // coba Jikan dulu, kalau gagal (timeout/block) langsung fallback AniList biar tetap keisi
  let result = await searchJikan(title);
  if (!result) result = await searchAniList(title);
  CACHE.set(key, result);
  return result;
}

export function clearJikanCache() { CACHE.clear(); }
