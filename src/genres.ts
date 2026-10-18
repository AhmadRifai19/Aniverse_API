// daftar genre lengkap (26) — kayak rak buku yang lengkap, bukan cuma 13
// ini sumber kebenaran untuk Navbar, Browse, Home, dan seed biar ejaannya konsisten

export const GENRES = [
  "Action",
  "Adventure",
  "Avant Garde",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Supernatural",
  "Suspense",
  "Sports",
  "Music",
  "Mecha",
  "Ecchi",
  "Psychological",
  "Seinen",
  "Shounen",
  "Shoujo",
  "Josei",
  "School",
  "Historical",
  "Military",
  "Magic",
] as const;

export type Genre = typeof GENRES[number];

const ALIAS: Record<string, string> = {
  "sci fi": "Sci-Fi",
  "scifi": "Sci-Fi",
  "sci-fi": "Sci-Fi",
  "slice_of_life": "Slice of Life",
  "slice of life": "Slice of Life",
  "avant garde": "Avant Garde",
  "avantgarde": "Avant Garde",
  "mahou shoujo": "Magic",
  "magical girl": "Magic",
  "magic": "Magic",
  "psychological": "Psychological",
  "suspense": "Suspense",
  "sports": "Sports",
  "seinen": "Seinen",
  "shounen": "Shounen",
  "shonen": "Shounen",
  "shoujo": "Shoujo",
  "shojo": "Shoujo",
  "josei": "Josei",
  "school": "School",
  "historical": "Historical",
  "military": "Military",
  "music": "Music",
  "mecha": "Mecha",
  "ecchi": "Ecchi",
  "hentai": "Ecchi",
  "girls love": "Romance",
  "boys love": "Romance",
  "yaoi": "Romance",
  "yuri": "Romance",
};

export function normalizeGenre(raw: string): string {
  const t = raw.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const lower = t.toLowerCase();
  if (ALIAS[lower]) return ALIAS[lower];
  // title-case fallback — "action" -> "Action", "SCI FI" -> "Sci Fi" lalu alias tangkap lagi
  const titled = t
    .toLowerCase()
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  if (ALIAS[titled.toLowerCase()]) return ALIAS[titled.toLowerCase()];
  // jika sudah ada di list GENRES langsung pakai, kalau tidak kembalikan Title Case (biar tetap ke-simpan)
  const found = GENRES.find(g => g.toLowerCase() === lower);
  return found ?? titled;
}

export function normalizeGenres(list: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const g of list) {
    const n = normalizeGenre(g);
    if (!n) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out.slice(0, 6);
}
