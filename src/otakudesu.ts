// standalone scraper — langsung ke otakudesu.blog, tanpa otakudesu-be perantara
// porting plek dari otakudesu-be: scapeOngoingAnime + scrapeSingleAnime + mapGenres + scrapeAnimeEpisodes
// biar versi-ringan 1 project aja udah auto jalan di Vercel (cron 1 jam)

import { load } from 'cheerio';
import { config } from './config.js';

function getBaseUrl(): string {
  const raw = (config as any).otakudesuBase ?? (config as any).baseUrl ?? 'https://otakudesu.blog/';
  return raw.endsWith('/') ? raw : raw + '/';
}

async function fetchHTML(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[otakudesu] ${url} -> ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.warn(`[otakudesu] fail ${url}`, (e as Error).message);
    return null;
  }
}

// ——— types ——— (tetap sama biar sync.ts gak perlu diubah)
export interface OngoingItem {
  title?: string;
  slug?: string;
  poster?: string;
  current_episode?: string;
}

export interface EpisodeListItem {
  episode?: string;
  episode_number?: number;
  slug?: string;
}

export interface AnimeDetail {
  title?: string;
  slug?: string;
  poster?: string;
  rating?: string;
  status?: string;
  synopsis?: string;
  studio?: string;
  type?: string;
  genres?: { name: string; slug: string }[];
  episode_lists: EpisodeListItem[];
}

// ——— helpers porting ———

// dari mapGenres.ts
function mapGenres(html: string): { name: string; slug: string }[] {
  const result: { name: string; slug: string }[] = [];
  if (!html) return result;
  const parts = html.split('</a>').filter(s => s.trim() !== '').map(s => `${s}</a>`);
  for (const part of parts) {
    const $ = load(part);
    const name = $('a').text().trim();
    const href = $('a').attr('href') ?? '';
    const slug = href.replace(/^https:\/\/otakudesu\.[a-zA-Z0-9-]+\/genres\//, '').replace('/', '').trim();
    if (name) result.push({ name, slug });
  }
  return result;
}

// dari scrapeAnimeEpisodes.ts
function scrapeAnimeEpisodes(html: string): EpisodeListItem[] | undefined {
  const result: EpisodeListItem[] = [];
  let $ = load(html);
  $ = load(`<div> ${$('.episodelist').toString()}</div>`);
  const listHtml = $('.episodelist:nth-child(2) ul').html();
  if (!listHtml) return undefined;
  const items = listHtml.split('</li>').filter(s => s.trim() !== '').map(s => `${s}</li>`);
  for (const item of items) {
    const $$ = load(item);
    const titleText = $$('li span:first a').text().trim();
    const href = $$('li span:first a').attr('href') ?? '';
    const episodeNumber = titleText.replace(/^.*Episode\s+/, '').replace(/\D.*$/, '').trim();
    result.unshift({
      episode: titleText || undefined,
      episode_number: episodeNumber ? parseInt(episodeNumber, 10) : undefined,
      slug: href.replace(/^https:\/\/otakudesu\.[a-zA-Z0-9-]+\/episode\//, '').replace('/', '') || undefined,
    });
  }
  return result;
}

// ——— fetch ongoing page ——— (dari utils/ongoingAnime.ts + scapeOngoingAnime.ts)
export async function fetchOngoingPage(page: number): Promise<OngoingItem[]> {
  const base = getBaseUrl();
  const url = `${base}ongoing-anime/page/${page}`;
  const html = await fetchHTML(url);
  if (!html) return [];
  const $ = load(html);
  const raw = $('.venutama .rseries .rapi .venz ul li').toString();
  if (!raw) return [];
  const chunks = raw.split('</li>').filter(s => s.trim() !== '').map(s => `${s}</li>`);
  const out: OngoingItem[] = [];
  for (const chunk of chunks) {
    const $$ = load(chunk);
    const title = $$('.detpost .thumb .thumbz .jdlflm').text().trim() || undefined;
    const href = $$('.detpost .thumb a').attr('href') ?? '';
    const slug = href.replace(/^https:\/\/otakudesu\.[a-zA-Z0-9-]+\/anime\//, '').replace('/', '').trim() || undefined;
    const poster = $$('.detpost .thumb .thumbz img').attr('src') || undefined;
    const current_episode = $$('.detpost .epz').text().trim() || undefined;
    if (slug) out.push({ title, slug, poster, current_episode });
  }
  return out;
}

// ——— fetch anime detail ——— (dari utils/anime.ts + scrapeSingleAnime.ts)
export async function fetchAnimeDetail(slug: string): Promise<AnimeDetail | null> {
  const base = getBaseUrl();
  const url = `${base}anime/${slug}`;
  const html = await fetchHTML(url);
  if (!html) return null;
  const $ = load(html);

  const title = $('.infozin .infozingle p:first span').text().replace('Judul: ', '').trim() || undefined;
  // slug canonical kadang .cloud, fallback ke param
  const canonical = $('link[rel=canonical]').attr('href') ?? '';
  const slugFromCanonical = canonical
    ? canonical.replace(/^https:\/\/otakudesu\.[a-zA-Z0-9.-]+\/anime\//, '').replace('/', '').trim()
    : undefined;
  const finalSlug = slugFromCanonical || slug;

  const rating = $('.infozin .infozingle p:nth-child(3) span').text().replace('Skor: ', '').trim() || undefined;
  const type = $('.infozin .infozingle p:nth-child(5) span').text().replace('Tipe: ', '').trim() || undefined;
  const status = $('.infozin .infozingle p:nth-child(6) span').text().replace('Status: ', '').trim() || undefined;
  const studio = $('.infozin .infozingle p:nth-child(10) span').text().replace('Studio: ', '').trim() || undefined;

  // poster & synopsis
  const poster = $('.fotoanime img').attr('src') || undefined;
  const synopsis = $('.sinopc').text().split('<p>').map(s => s.replace('</p>', '\n').replace('&nbsp', '')).join('').trim() || undefined;

  // genres — ambil dari p:last span a
  const genreHtml = $('.infozin .infozingle p:last span a').toString();
  const genres = mapGenres(genreHtml);

  const episode_lists = scrapeAnimeEpisodes(html) ?? [];

  return {
    title,
    slug: finalSlug,
    poster,
    rating,
    status,
    synopsis,
    studio: studio && studio !== '-' ? studio : undefined,
    type,
    genres,
    episode_lists,
  };
}
