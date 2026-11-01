import { youtubeEmbedUrl } from "@/features/media/parse";

export type WordMediaItem = { id: string; kind: "image" | "audio" | "youtube"; url: string; youtubeId: string | null; startSec: number | null; endSec: number | null; credit: string | null };

/**
 * Pictures, sounds and short YouTube clips for a word. Nothing autoplays; YouTube uses the
 * no-cookie domain with related videos limited, inside a sandboxed frame.
 */
export function WordMedia({ items, word }: { items: WordMediaItem[]; word: string }) {
  if (!items.length) return null;
  return (
    <div className="space-y-3">
      {items.map((m) => (
        <figure key={m.id} className="space-y-1">
          {m.kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element -- reviewed external images; sizes vary
            <img src={m.url} alt={`صورة توضّح «${word}»`} loading="lazy" referrerPolicy="no-referrer" className="mx-auto max-h-64 w-auto rounded-xl object-contain" />
          )}
          {m.kind === "audio" && <audio controls preload="none" src={m.url} className="w-full" aria-label={`صوت «${word}»`} />}
          {m.kind === "youtube" && m.youtubeId && (
            <div className="aspect-video w-full overflow-hidden rounded-xl">
              <iframe
                src={youtubeEmbedUrl(m.youtubeId, m.startSec, m.endSec)}
                title={`مقطع يوضّح «${word}»`}
                className="h-full w-full"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-presentation"
                allow="encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
          {m.credit && <figcaption className="text-muted text-center text-xs">{m.credit}</figcaption>}
        </figure>
      ))}
    </div>
  );
}
