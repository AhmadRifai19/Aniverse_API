import 'dotenv/config';

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  // standalone: langsung ke otakudesu.blog, tanpa otakudesu-be perantara
  // dukung OTAKUDESU_BASE_URL / BASEURL biar kompatibel, default otakudesu.blog
  // prioritas: BASE_URL standalone dulu, baru fallback legacy localhost
  // kalau OTAKUDESU_API_URL masih localhost, anggap disabled -> pakai otakudesu.blog
  otakudesuBase: (() => {
    const base = process.env.OTAKUDESU_BASE_URL ?? process.env.BASEURL ?? '';
    if (base) return base;
    const legacy = process.env.OTAKUDESU_API_URL ?? '';
    if (legacy && !legacy.includes('localhost') && !legacy.includes('127.0.0.1')) return legacy;
    return 'https://otakudesu.blog/';
  })(),
  cronSecret: process.env.CRON_SECRET ?? '',
  scanLimit: Math.min(Number(process.env.SCAN_LIMIT ?? '25') || 25, 50),
  windowMinutes: Number(process.env.WINDOW_MINUTES ?? '60') || 60,
};

export function assertConfig() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL belum diisi di .env');
  // otakudesuBase opsional sekarang — default otakudesu.blog jadi gak wajib isi OTAKUDESU_API_URL lagi
}
