import { describe, expect, it } from "vitest";
import { parseMediaCsv, parseTime, parseYouTube, validateMedia, youtubeEmbedUrl } from "@/features/media/parse";

describe("word media input", () => {
  it("reads YouTube links in all common shapes and rejects lookalikes", () => {
    expect(parseYouTube("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42")).toEqual({ id: "dQw4w9WgXcQ", start: 42 });
    expect(parseYouTube("https://youtu.be/dQw4w9WgXcQ?t=1m5s")).toEqual({ id: "dQw4w9WgXcQ", start: 65 });
    expect(parseYouTube("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
    expect(parseYouTube("http://youtu.be/dQw4w9WgXcQ")).toBeNull(); // https only
    expect(parseYouTube("https://evil-youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYouTube("https://www.youtube.com/watch?v=short")).toBeNull();
  });
  it("parses times written several ways, including Arabic digits", () => {
    expect(parseTime("90")).toBe(90);
    expect(parseTime("1:30")).toBe(90);
    expect(parseTime("١:٠٥")).toBe(65);
    expect(parseTime("")).toBeNull();
    expect(parseTime("abc")).toBeNull();
  });
  it("YouTube clips need an end, stay short, and embed without cookies or autoplay", () => {
    expect(validateMedia({ kind: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" }).ok).toBe(false);
    expect(validateMedia({ kind: "youtube", url: "https://youtu.be/dQw4w9WgXcQ", startSec: 10, endSec: 200 }).ok).toBe(false);
    const ok = validateMedia({ kind: "youtube", url: "https://youtu.be/dQw4w9WgXcQ?t=12", endSec: 18 });
    expect(ok.ok && ok.value.startSec).toBe(12);
    const src = youtubeEmbedUrl("dQw4w9WgXcQ", 12, 18);
    expect(src.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?")).toBe(true);
    expect(src).not.toContain("autoplay");
  });
  it("images and sounds must be direct https files", () => {
    expect(validateMedia({ kind: "image", url: "https://upload.wikimedia.org/a/b/Horse.jpg" }).ok).toBe(true);
    expect(validateMedia({ kind: "image", url: "http://x.org/a.jpg" }).ok).toBe(false);
    expect(validateMedia({ kind: "image", url: "https://x.org/page" }).ok).toBe(false);
    expect(validateMedia({ kind: "audio", url: "https://upload.wikimedia.org/a/Horse_neigh.ogg" }).ok).toBe(true);
  });
  it("reads the team CSV, infers the kind, and skips rows without a link", () => {
    const rows = parseMediaCsv("الكلمة,النوع,الرابط,من,إلى,المصدر\nصهيل,يوتيوب,https://youtu.be/dQw4w9WgXcQ,0:03,0:09,قناة\nالحصان,,https://x.org/h.png,,,\nنهيق,صوت,,,,\n");
    expect(rows).toHaveLength(2);
    expect(rows[0].input).toMatchObject({ kind: "youtube", startSec: 3, endSec: 9, credit: "قناة" });
    expect(rows[1].input?.kind).toBe("image");
  });
});
