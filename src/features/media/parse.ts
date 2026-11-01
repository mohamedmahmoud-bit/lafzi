/**
 * Word media input rules (pure). Media is never fetched or generated here: an admin pastes a link
 * (or a CSV of links), we validate its shape, and a reviewer approves it before students see it.
 */
import { readCsv } from "@/features/lexicon/dataset";

export type MediaKind = "image" | "audio" | "youtube";
export type MediaInput = { kind: MediaKind; url: string; startSec?: number | null; endSec?: number | null; credit?: string | null };
export type ValidMedia = { kind: MediaKind; url: string; youtubeId: string | null; startSec: number | null; endSec: number | null; credit: string | null };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|svg)$/i;
const AUDIO_EXT = /\.(mp3|ogg|oga|wav|m4a|opus|webm)$/i;
/** Longest clip students are shown (keeps sounds short and focused). */
export const MAX_CLIP_SEC = 60;

/** «90», «1:30», «1m30s», «90s» → seconds. */
export function parseTime(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
  const s = v.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  if (/^\d+$/.test(s)) return Number(s);
  const colon = s.match(/^(\d+):([0-5]?\d)$/);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  const hms = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i);
  if (hms && (hms[1] || hms[2] || hms[3])) return Number(hms[1] ?? 0) * 3600 + Number(hms[2] ?? 0) * 60 + Number(hms[3] ?? 0);
  return null;
}

/** A YouTube watch / youtu.be / shorts / embed link → its id and optional start (t=…). */
export function parseYouTube(raw: string): { id: string; start: number | null } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/);
      id = m?.[1] ?? null;
    }
  }
  if (!id || !YT_ID.test(id)) return null;
  return { id, start: parseTime(u.searchParams.get("t") ?? u.searchParams.get("start")) };
}

function httpsUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/** Validate one media item; returns the normalized record or an Arabic error message. */
export function validateMedia(m: MediaInput): { ok: true; value: ValidMedia } | { ok: false; error: string } {
  const credit = m.credit?.trim().slice(0, 200) || null;
  if (m.kind === "youtube") {
    const yt = parseYouTube(m.url);
    if (!yt) return { ok: false, error: "رابط يوتيوب غير صالح" };
    const start = m.startSec ?? yt.start ?? null;
    const end = m.endSec ?? null;
    if (end == null) return { ok: false, error: "حدّد وقت النهاية للمقطع (لا نعرض فيديو كاملًا)" };
    if (start != null && end <= start) return { ok: false, error: "وقت النهاية يجب أن يكون بعد البداية" };
    if (end - (start ?? 0) > MAX_CLIP_SEC) return { ok: false, error: `المقطع أطول من ${MAX_CLIP_SEC} ثانية` };
    return { ok: true, value: { kind: "youtube", url: `https://www.youtube.com/watch?v=${yt.id}`, youtubeId: yt.id, startSec: start, endSec: end, credit } };
  }
  const u = httpsUrl(m.url);
  if (!u) return { ok: false, error: "الرابط يجب أن يبدأ بـ https://" };
  const ext = m.kind === "image" ? IMAGE_EXT : AUDIO_EXT;
  if (!ext.test(u.pathname)) return { ok: false, error: m.kind === "image" ? "رابط الصورة يجب أن ينتهي بامتداد صورة (jpg / png / webp / svg)" : "رابط الصوت يجب أن ينتهي بامتداد صوت (mp3 / ogg / wav / m4a)" };
  return { ok: true, value: { kind: m.kind, url: u.toString(), youtubeId: null, startSec: null, endSec: null, credit } };
}

const KIND_AR: Record<string, MediaKind> = { صورة: "image", صوت: "audio", يوتيوب: "youtube", فيديو: "youtube", image: "image", audio: "audio", youtube: "youtube" };

export type MediaCsvRow = { rowNumber: number; word: string; input: MediaInput | null; error: string | null };

/** CSV columns: الكلمة، النوع (صورة/صوت/يوتيوب)، الرابط، من، إلى، المصدر. Rows without a link are skipped. */
export function parseMediaCsv(text: string): MediaCsvRow[] {
  const rows = readCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iw = col("الكلمة", "word"), ik = col("النوع", "kind"), iu = col("الرابط", "url"), is = col("من", "start"), ie = col("إلى", "الى", "end"), ic = col("المصدر", "credit");
  if (iw < 0 || iu < 0) throw new Error("الملف يحتاج عمودي «الكلمة» و«الرابط»");
  const out: MediaCsvRow[] = [];
  rows.slice(1).forEach((r, i) => {
    const word = (r[iw] ?? "").trim();
    const url = (r[iu] ?? "").trim();
    if (!word || !url) return;
    const kindRaw = (ik >= 0 ? r[ik] : "").trim();
    const kind = KIND_AR[kindRaw] ?? (parseYouTube(url) ? "youtube" : IMAGE_EXT.test(url) ? "image" : AUDIO_EXT.test(url) ? "audio" : null);
    if (!kind) return out.push({ rowNumber: i + 2, word, input: null, error: "نوع غير معروف (صورة / صوت / يوتيوب)" });
    out.push({ rowNumber: i + 2, word, input: { kind, url, startSec: parseTime(is >= 0 ? r[is] : null), endSec: parseTime(ie >= 0 ? r[ie] : null), credit: ic >= 0 ? r[ic] : null }, error: null });
  });
  return out;
}

/** Privacy-friendly embed URL: no cookies, no related videos from other channels, no autoplay. */
export function youtubeEmbedUrl(id: string, start: number | null, end: number | null) {
  const p = new URLSearchParams({ rel: "0", modestbranding: "1", playsinline: "1" });
  if (start != null) p.set("start", String(start));
  if (end != null) p.set("end", String(end));
  return `https://www.youtube-nocookie.com/embed/${id}?${p}`;
}
