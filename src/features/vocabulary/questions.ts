import type { QuestionType, StoredQuestion } from "@/db/schema";
import { normalizeArabic, shuffle } from "@/lib/utils";

/** The minimal word shape needed to build questions (pure, DB-agnostic). */
export type QuizWord = {
  id: string;
  word: string;
  meaning: string;
  example: string;
  synonyms: string[];
  antonyms: string[];
  difficulty: number;
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  meaning: "المعنى",
  synonym: "المرادف",
  reverse: "من المرادف إلى الكلمة",
  antonym: "الضد",
  context: "إكمال الجملة",
  analogy: "التناظر اللفظي",
};

const BLANK = "ــــــــ";
const OPTION_IDS = ["a", "b", "c", "d"];

type Rand = () => number;

function pickOne<T>(items: readonly T[], rand: Rand): T | undefined {
  return items.length ? items[Math.floor(rand() * items.length)] : undefined;
}

/** Choose `n` distinct distractor strings not equal (after normalisation) to any excluded text. */
function pickDistractors(candidates: string[], exclude: string[], n: number, rand: Rand): string[] {
  const seen = new Set(exclude.map(normalizeArabic));
  const out: string[] = [];
  for (const c of shuffle(candidates, rand)) {
    const key = normalizeArabic(c);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}

function build(
  type: QuestionType,
  target: QuizWord,
  prompt: string,
  stem: string | undefined,
  correct: string,
  distractors: string[],
  explanation: string,
  rand: Rand,
): StoredQuestion | null {
  if (distractors.length < 3) return null;
  const texts = shuffle([correct, ...distractors.slice(0, 3)], rand);
  const options = texts.map((text, i) => ({ id: OPTION_IDS[i], text }));
  const correctOptionId = options.find((o) => o.text === correct)!.id;
  return { type, prompt, stem, options, correctOptionId, explanation, wordId: target.id };
}

/** The example sentence with the target word blanked out, or null if the word is not present. */
export function blankOut(example: string, word: string): string | null {
  const idx = example.indexOf(word);
  if (idx === -1) return null;
  return example.slice(0, idx) + BLANK + example.slice(idx + word.length);
}

export function buildQuestion(
  type: QuestionType,
  target: QuizWord,
  pool: QuizWord[],
  rand: Rand,
): StoredQuestion | null {
  const others = pool.filter((w) => w.id !== target.id);
  const ownTexts = [target.word, ...target.synonyms];

  switch (type) {
    case "meaning":
      return build(
        type,
        target,
        "ما معنى الكلمة؟",
        target.word,
        target.meaning,
        pickDistractors(
          others.map((w) => w.meaning),
          [target.meaning],
          3,
          rand,
        ),
        `«${target.word}» تعني: ${target.meaning}`,
        rand,
      );

    case "synonym": {
      const correct = pickOne(target.synonyms, rand);
      if (!correct) return null;
      return build(
        type,
        target,
        "اختر أقرب مرادف للكلمة",
        target.word,
        correct,
        pickDistractors(
          others.flatMap((w) => w.synonyms),
          [...ownTexts, ...target.antonyms],
          3,
          rand,
        ),
        `«${correct}» مرادف «${target.word}»؛ وكلاهما بمعنى: ${target.meaning}`,
        rand,
      );
    }

    case "reverse": {
      const syn = pickOne(target.synonyms, rand);
      if (!syn) return null;
      return build(
        type,
        target,
        "أي الكلمات التالية تحمل المعنى نفسه؟",
        syn,
        target.word,
        pickDistractors(
          others.map((w) => w.word),
          ownTexts,
          3,
          rand,
        ),
        `«${target.word}» و«${syn}» بمعنى واحد: ${target.meaning}`,
        rand,
      );
    }

    case "antonym": {
      const correct = pickOne(target.antonyms, rand);
      if (!correct) return null;
      // Classic Qudurat trap: one distractor is a synonym of the word.
      const trap = pickOne(target.synonyms, rand);
      const rest = pickDistractors(
        others.flatMap((w) => w.antonyms),
        [...target.antonyms, ...ownTexts],
        trap ? 2 : 3,
        rand,
      );
      return build(
        type,
        target,
        "اختر ضدّ الكلمة",
        target.word,
        correct,
        trap ? [trap, ...rest] : rest,
        trap
          ? `«${correct}» ضدّ «${target.word}». انتبه: «${trap}» مرادف وليس ضدًا.`
          : `«${correct}» ضدّ «${target.word}».`,
        rand,
      );
    }

    case "context": {
      const sentence = blankOut(target.example, target.word);
      if (!sentence) return null;
      const near = others.filter((w) => Math.abs(w.difficulty - target.difficulty) <= 1);
      return build(
        type,
        target,
        "اختر الكلمة المناسبة لإكمال الجملة",
        sentence,
        target.word,
        pickDistractors(
          (near.length >= 3 ? near : others).map((w) => w.word),
          ownTexts,
          3,
          rand,
        ),
        `الجملة الصحيحة: ${target.example}`,
        rand,
      );
    }

    case "analogy": {
      // A : A′ :: target : ?   — relation is synonymy or antonymy depending on available data.
      const useAntonym = target.antonyms.length > 0 && rand() < 0.5;
      const relation = useAntonym ? "antonyms" : "synonyms";
      const answer = pickOne(target[relation], rand);
      const anchor = pickOne(
        others.filter((w) => w[relation].length > 0),
        rand,
      );
      if (!answer || !anchor) return null;
      const anchorPair = anchor[relation][0];
      const trapPool = useAntonym ? target.synonyms : target.antonyms;
      const trap = pickOne(trapPool, rand);
      const rest = pickDistractors(
        others.filter((w) => w.id !== anchor.id).flatMap((w) => w[relation]),
        [answer, ...ownTexts, ...target.antonyms, anchorPair],
        trap ? 2 : 3,
        rand,
      );
      const relationName = useAntonym ? "تضاد" : "ترادف";
      return build(
        type,
        target,
        "اختر ما يكمل العلاقة نفسها",
        `${anchor.word} : ${anchorPair}  ::  ${target.word} : ؟`,
        answer,
        trap ? [trap, ...rest] : rest,
        `العلاقة ${relationName}: «${anchor.word}» و«${anchorPair}»، وكذلك «${target.word}» و«${answer}».`,
        rand,
      );
    }
  }
}

/** Try preferred types in order, falling back to `meaning` (always buildable with a pool ≥ 4). */
export function buildFirstPossible(
  types: QuestionType[],
  target: QuizWord,
  pool: QuizWord[],
  rand: Rand,
): StoredQuestion | null {
  for (const t of [...types, "meaning" as const]) {
    const q = buildQuestion(t, target, pool, rand);
    if (q) return q;
  }
  return null;
}

/** Strip the answer key before anything is sent to the browser. */
export function toClientQuestion(q: StoredQuestion) {
  return { type: q.type, prompt: q.prompt, stem: q.stem, options: q.options };
}
export type ClientQuestion = ReturnType<typeof toClientQuestion>;
