# Noon question bank → لفظي

The official Noon question bank is the **single source of truth** for every question, option,
answer, explanation, reading passage and vocabulary word students see. لفظي never generates,
rewrites or substitutes assessment content.

## What we know about Noon's question API (verified)

Observed through Noon's own content tooling, 2026-10-29:

| Capability | Status |
|---|---|
| Question detail `GET /questions/{id}` → `QuestionDTO` | ✅ documented |
| Search with filters: subject / chapter / topic / subtopic / concept, `difficultyLevels` 1–5, `hasCorrectAnswer`, `hasExplanation`, `isSuitableForPractice`, `hasBeenFlagged`; `page`, `size ≤ 100`, sort `createdAt` | ✅ exists, but the **path and auth for a third-party app are not documented** |
| Curriculum tree (chapters → topics → subtopics → concepts) | ✅ exists; bundled as a snapshot in `src/features/curriculum/noon-verbal-curriculum.ts` (official IDs, subject 249) |
| `updatedAt` / modification timestamps | ❌ only `createdAt` |
| Incremental "changed since" queries | ❌ |
| Webhooks / change notifications | ❌ |
| Reading passages | ✅ as `additionalMaterials[type=reference]`, shared by id across questions |
| Explanations | ✅ as `additionalMaterials[type=explanation]` (HTML) — sometimes absent |

Verbal chapters: 2854 التناظر اللفظي · 2855 استيعاب المقروء · 2856 إكمال الجمل · 2857 الخطأ السياقي ·
2858 الاختلاف · 2859 الارتباط · 5505 الكلمة الزائدة. There is no vocabulary chapter: vocabulary is
derived from questions (see below).

## What we need from Noon (blocking production content)

1. **An authorised endpoint for this app**: base URL, search path, auth scheme (service token?),
   rate limits. Configure `NOON_QB_BASE_URL`, `NOON_QB_TOKEN`, `NOON_QB_SEARCH_PATH`.
   Alternative: an approved periodic JSON export of `QuestionDTO`s (`NOON_QB_PROVIDER=file`).
2. **Written permission** to store copies of questions in the companion app's database.
3. Ideally: `updatedAt` on questions or a change feed/webhook (then sync becomes incremental).
4. Confirmation of how removed/retired questions appear (deleted vs. flag).

Until (1) and (2) exist, production must run with `NOON_QB_PROVIDER=none`: games and word of the day
show "content unavailable". Nothing breaks and nothing is invented.

## Providers (`src/features/question-bank/providers`)

| id | Use | Notes |
|---|---|---|
| `none` | default | everything fails closed |
| `http` | Noon API | token sent only in the `Authorization` header; fails closed if any setting is missing |
| `file` | approved export | JSON array (or `{data: [...]}`) of `QuestionDTO`s |
| `mock` | **development only** | 20 synthetic items, every stem prefixed «(تجريبي)», ids 990001+, refused in production, never committed real content |

Each provider declares `capabilities` (`incrementalUpdates`, `webhooks`, `modificationTimestamps`
are all `false` today) — the sync engine never assumes more than that.

## Sync = paginated reconciliation

`syncQuestionBank()` (`sync.service.ts`), run by `/api/cron/question-sync` (Bearer `CRON_SECRET`;
daily on Vercel Hobby, every 6 h on Pro) or the **مزامنة الآن** button in `/admin/question-bank`:

1. Refresh curriculum nodes.
2. For each configured chapter, page through all questions (retry ×3 with backoff per page).
3. For each question: normalise → `contentHash` (everything) + `correctnessHash` (stem, options,
   answer, passage). Same hash → `unchanged`. New hash → a **new immutable version** (old versions
   are never overwritten). Per-question advisory lock prevents duplicates under concurrency.
4. **Removal is inferred only after a complete, error-free pass**: questions in scope that were not
   seen are archived and unpublished. A partial run never archives anything.
5. A single-run lock prevents overlapping syncs; every run is recorded in `question_sync_runs`
   with stats (new / modified / unchanged / restored / removed / suspended…).

This is periodic reconciliation, **not real-time**.

## Validation & review workflow

`IMPORTED → VALIDATING → READY | REVIEW_REQUIRED | REJECTED → (human) PUBLISHED`, plus `ARCHIVED`.

Checks (`validation.ts`) — any error → rejected; any warning → review required:

- errors: Noon id, mock-in-production, MCQ type, single answer, stem, 2–6 distinct non-empty
  options, exactly one existing correct option, Arabic text, no broken encoding/HTML, Noon's
  `suitableForPractice`, verbal subject, linked passage for reading questions
- warnings: image options, difficulty 1–5, unresolved reports, single chapter, topic/subskill
  mapping, **content-shape checks that don't trust the tag** (analogy = word-pair stem and options,
  completion = sentence with a blank, contextual error = options are words of the sentence),
  exact duplicate of another question
- info: explanation present (missing → students see «لا يتوفر شرح لهذا السؤال في بنك نون»), live game

Publishing is always a reviewer decision (`/admin/question-bank/[id]`) and is refused while any
error-level check fails. Noon's tag mapping and native game compatibility are approved on publish.

### When Noon changes a published question

- correctness changed (stem/options/answer/passage) → **suspended** (`review_required`,
  unpublished) until a reviewer approves the new version;
- only explanation/metadata changed and validation still passes → stays published on the new version;
- removed from the bank → archived; vocabulary built on it is suspended.

Game answers store the exact `question_version_id` that was answered, so history never changes.

## Games use the published pool only

`publishedQuestions()` returns published + approved-for-the-game questions (mock excluded in
production). Games play questions **natively**: same stem, same options, same answer. Options are
reordered only when Noon's own `shuffleChoices` flag allows it. The only hint removes one wrong
option. Any game that changes the task needs a `transform` compatibility row approved by a reviewer
— none exist yet.

## Vocabulary from the bank

Pipeline: published analogy question → candidate extraction → validation → **human review** →
approved repository → word of the day / كنز الكلمات / SRS / badges.

- A relationship is proposed only when **Noon states it**: the question's concept is «الترادف» /
  «التضاد…», and/or Noon's explanation says «العلاقة هنا هي: ترادف/تضاد». Two words appearing in the
  same question is never enough; distractor pairs are never used.
- Pairs come from the stem and the correct option; every entry links to its Noon question id,
  version and context.
- Tag/explanation conflicts block approval. Approval records the reviewer.
- Meanings can be approved only as a **verbatim quote** from the source question's Noon explanation;
  otherwise students see «لا يوجد تعريف معتمد».
- After every sync, approved items are reassessed: evidence from a question that is no longer
  published on the same version is invalid; with no valid evidence the item is suspended.

## Security

- Credentials stay server-side (env); never in URLs, logs or the client.
- Answer keys and explanations are sent to the browser only after the student answers.
- Admin routes require the admin role; every decision is audited.
- No scraping: only configured, authorised providers.
- The public repository contains no Noon question content — only synthetic mock items.
