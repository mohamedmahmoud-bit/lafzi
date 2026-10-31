# Lafzi 2.0 — game-first vocabulary

OPEN → PLAY → LEARN → WIN → SHARE → RETURN TOMORROW.

## Content pipeline (trustworthy vocabulary)

```
source file (data/vocabulary/lafzi-initial-427.md, CSV/Markdown upload, Noon extraction, admin)
  → vocab_import_rows  (every source row exactly as supplied; never overwritten)
  → automated checks + linguistic review notes  (staged = clean, flagged = needs a human)
  → reviewer approves (one row, or «اعتماد كل السليم»)   ← /admin/lexicon
  → vocabulary_entries (one per word, lexical key ignores diacritics/hamza/«ال»)
    word_senses (approved meanings + examples + sources)
    entry_categories (a word can be in many categories)
    vocabulary_relationships (typed + directional: أسد → زئير is `sound`, not a synonym)
  → games / word of the day / SRS / badges
```

- The production build stages the 427-row dataset automatically (idempotent by file hash) but
  publishes nothing. An admin must approve rows in **/admin/lexicon**. The dev seed approves the
  clean rows so local games have content.
- 390 rows pass every check; 37 are flagged: duplicates (مديد), inconsistent meanings (يراع),
  spelling variants (إفراط/الإفراط), circular definitions, multi-value cells (قصف وهزيم), and 25
  linguistic review notes (e.g. «القط → هِرّ» young, «دب → دببة» female, «القط → الأفحوص» home,
  «الأنعام → ثغاء», «المطر → هطل»). See `src/features/lexicon/review-notes.ts`.
- Reviewer corrections are stored in `edited` beside the original. Duplicates can be merged
  (senses, relations, categories and student progress move with them).
- Dataset words are labelled «قائمة مفردات لفظي الأولية» as their source — never «verified from Noon».
- Noon-question-derived vocabulary keeps its Noon evidence and is suspended if the question changes;
  dataset-backed items are not affected by question-bank syncs.

## Games (server-graded, no generated content)

| Game | Mechanic | Content |
|---|---|---|
| صائد المعاني | word → 4 meanings | approved senses; distractors are other words' approved meanings, never a synonym's |
| وصلها صح | match board (5 pairs) | one relation type; boards are unambiguous (جحر can't appear for two animals) |
| سباق الكلمات | 75-second race | mixed meaning + relation questions; server deadline; speed bonus only for human-speed answers |
| الكلمة الدخيلة | odd one out | 3 answers of one relation type + 1 of another, checked to be unambiguous |
| ذاكرة لفظي | memory flip | 6 pairs; wrong flips count as mistakes but never lock a pair |
| تحدي اليوم | daily mini-challenge | 10 rounds, identical for every student that day |
| تحدي الصاحب | async friend challenge | frozen round set; both play the same rounds; results after both finish |

Answer keys never reach the browser before answering. Every answer is idempotent; XP is in the
auditable ledger with daily caps; random guessing earns little (accuracy multiplier, minimum rounds).

## Habit loop

- **Streak day** = at least 5 valid word interactions (answers) in the Asia/Riyadh day. Opening the
  app or only the word of the day doesn't count. Missed days reset gently (no punishment screens).
- **Daily mission** = كلمة اليوم + تحدي اليوم.
- **Friend streaks** advance on days both friends qualify independently.
- **Spaced repetition** (Leitner) on every word answered; due words come back first.
- XP actions: game_completed, daily_challenge, word_mastered, challenge_completed, challenge_won,
  wod_* — all configurable in /admin/xp-rules.

## Social & privacy (students may be minors)

- Friends via expiring invite links (`/f/<code>`) or by accepting a challenge (`/c/<code>`).
  Codes are random, contain no personal data. No private messaging.
- Block (also removes friendship) and report (reviewed by staff).
- Leaderboards: **friends** (default), **cohort** (only students who opted in; full names of
  non-friends only when `COHORT_LEADERBOARD_NAMES=true` is authorised — otherwise the audience is
  restricted to friends and the student sees just their own rank), **category** (friends).
- Profile visibility: friends / private. Score sharing is off by default.

## Identity

- `student_profiles.official_full_name` comes only from Noon identity sync (Citadel). A database
  trigger rejects any change outside the sync transaction; the profile API accepts only
  `avatar`, `shareScores`, `profileVisibility` (`.strict()`), and rejects any name field.
- Avatars: 18 curated originals; changing one never affects XP, badges or streaks.
