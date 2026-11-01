/**
 * Candidate vocabulary from Noon bank questions and reading passages. PURE.
 * It only proposes words (with how often and where they occur); a reviewer writes the meaning.
 * Bank questions themselves are never shown to students.
 */
import { lexKey } from "@/features/lexicon/normalize";

export type BankText = { noonQuestionId: number; stem: string; choices: string[]; passage: string | null; topic: string | null };
export type Candidate = { normalized: string; lemma: string; frequency: number; sources: { noonQuestionId: number; kind: string }[]; score: number };

/** Common function words and very frequent everyday words that are never vocabulary targets. */
const STOP = new Set(
  `من إلى الى عن على في مع هو هي هم هن أنت انت أنا انا نحن هذا هذه ذلك تلك هؤلاء الذي التي الذين اللذان اللتان ما ماذا متى أين اين كيف لماذا هل لا لم لن
  قد كان كانت يكون تكون كل بعض غير بين حتى إذا اذا إن ان أن لأن لكن بل ثم أو او أي اي عند منذ قبل بعد فوق تحت أمام خلف حول دون ليس ليست مثل كما لدى لدي
  إلا الا وهو وهي ولا وقد فقد فإن وإن وأن لقد عليه عليها فيه فيها منه منها إليه اليه إليها به بها لها له لهم لهن هنا هناك جدا أكثر اكثر أقل اقل أول اول آخر اخر
  يوم سنة شيء شيء كثير قليل كبير صغير جديد قديم الناس الإنسان الانسان أحد احد واحد اثنان ثلاثة أيضا ايضا فقط حيث بينما سوف عندما كذلك ذات ذو ذي`.split(/\s+/).filter(Boolean),
);

const ARABIC_WORD = /[ء-يً-ْٰ]+/g;
const strip = (w: string) => w.replace(/[ً-ْٰـ]/g, "");

/** Words (≥3 letters, not stop words) from a text. */
export function wordsOf(text: string): string[] {
  return (text.match(ARABIC_WORD) ?? [])
    .map(strip)
    .map((w) => w.replace(/^(و|ف)(?=ال)/, "")) // وال / فال
    .filter((w) => w.replace(/^ال/, "").length >= 3 && !STOP.has(w) && !STOP.has(w.replace(/^ال/, "")));
}

/**
 * Score: words that are the actual target of a question (analogy pair words, single-word
 * options) count most; passage words count less and only when not everyday-frequent.
 */
export function extractCandidates(texts: BankText[], known: Set<string>): Candidate[] {
  const map = new Map<string, Candidate>();
  const add = (w: string, q: number, kind: string, weight: number) => {
    const key = lexKey(w);
    if (known.has(key) || key.length < 3) return;
    const c = map.get(key) ?? { normalized: key, lemma: w, frequency: 0, sources: [], score: 0 };
    c.frequency++;
    c.score += weight;
    if (c.sources.length < 12 && !c.sources.some((s) => s.noonQuestionId === q && s.kind === kind)) c.sources.push({ noonQuestionId: q, kind });
    map.set(key, c);
  };
  for (const t of texts) {
    const pair = /[:：]/.test(t.stem) && t.stem.split(/[:：]/).length === 2;
    for (const w of wordsOf(t.stem)) add(w, t.noonQuestionId, pair ? "pair" : "stem", pair ? 3 : 1);
    for (const ch of t.choices) {
      const ws = wordsOf(ch);
      const kind = /[:：]/.test(ch) ? "pair" : ws.length <= 2 ? "option" : "choice";
      for (const w of ws) add(w, t.noonQuestionId, kind, kind === "pair" ? 3 : kind === "option" ? 2 : 1);
    }
    if (t.passage) for (const w of wordsOf(t.passage)) add(w, t.noonQuestionId, "passage", 0.5);
  }
  // Everyday words repeat across many questions; Qudurat vocabulary is rare in the bank. Keep words
  // that are rare (≤ RARE times) and rank question targets (pair words, single-word options) first.
  const RARE = 4;
  return [...map.values()]
    .filter((c) => c.frequency <= RARE && c.lemma.replace(/^ال/, "").length >= 3)
    .map((c) => {
      const pairWord = c.sources.some((s) => s.kind === "pair");
      const option = c.sources.some((s) => s.kind === "option");
      // Inflected forms (attached pronouns, plural verb endings) rank lower: the reviewer fixes them.
      const inflected = /(ك|كم|كما|هم|هما|هن|ها|نا|ون|ين|وا)$/.test(c.lemma.replace(/^ال/, "")) && c.lemma.length > 4;
      return { ...c, score: (pairWord ? 20 : option ? 10 : 0) + (RARE + 1 - c.frequency) - (inflected ? 6 : 0) };
    })
    .sort((a, b) => b.score - a.score);
}
