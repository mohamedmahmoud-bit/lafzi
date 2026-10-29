# لفظي — Architecture & MVP Plan

> **Update (question-bank platform):** content now comes only from the Noon question bank and
> practice links only from verified destinations. See [QUESTION_BANK.md](QUESTION_BANK.md) and
> [NOON_INTEGRATION.md](NOON_INTEGRATION.md); those documents supersede the vocabulary, deep-link
> and skill-id sections below (template URLs and `NOON_SKILL_ID_MAP` were removed).


> Status: MVP. Everything marked **[NOON-REQUIRED]** needs real information from Noon Academy
> before production. Until then a clearly-labelled development adapter is used.

## 0. Repository inspection (starting point)

The repository was empty. The project was scaffolded from `create-next-app@16.4.3`
(Next.js 16 App Router, React 19.3, Tailwind CSS 4, TypeScript 5).

Notable Next.js 16 facts that shaped the design:

- `middleware.ts` is now **`proxy.ts`** — used only for optimistic auth redirects + security headers.
- `params`, `searchParams`, `cookies()` are async.
- `cacheComponents` is **disabled** on purpose: every screen is personalised (streak, XP, today's
  mission), so classic dynamic rendering is simpler and safer for the MVP. Caching is applied
  narrowly (Noon skill snapshot cache table, XP-rule/level config memo).

## 1. Final architecture

A single Next.js deployable (modular monolith) + PostgreSQL. No microservices.

```
Browser (RTL, mobile-first)
   │  Server Components (read)      Server Actions (write, CSRF-protected by Next origin check)
   ▼                                Route Handlers (/api/auth/*, /go/noon, /api/health)
┌──────────────────────────── Next.js (Node runtime) ────────────────────────────┐
│ src/app/            routes, layouts, pages (UI only)                            │
│ src/components/     UI kit (shadcn-style) + app chrome                          │
│ src/features/*      domain modules — pure logic + services + actions            │
│   auth/             session (DB-backed), DAL guards, IdentityProvider adapters  │
│   daily-word/       كلمة اليوم selection, no-repeat window, question            │
│   vocabulary/       SRS engine (pluggable), deck builder, question generator    │
│   gamification/     XP rules, XP ledger service, levels                         │
│   streaks/          pure streak math (Asia/Riyadh), freeze-ready                │
│   missions/         مهمة اليوم template + progress                              │
│   badges/           criteria evaluators + award service                         │
│   leaderboard/      weekly cohort ranking + weekly snapshots                    │
│   noon-integration/ LearningIntegration adapters, skill registry, deep links    │
│   analytics/        provider-independent analytics.track + metrics queries      │
│   admin/            content management actions, CSV import, audit               │
│ src/lib/            time (Riyadh), rate limiting, env, utils                    │
│ src/db/             Drizzle schema, client, migrations runner, seed             │
└─────────────────────────────────────────────────────────────────────────────────┘
   │ Drizzle ORM (parameterised SQL)
   ▼
PostgreSQL 16 (local / Docker)  →  AWS RDS PostgreSQL (prod, TLS)
```

Rules:

- Business logic lives in `features/*` (pure functions are unit tested). React components never
  compute XP, streaks, badges or answers.
- The browser never sends XP amounts, correctness or answer keys. It sends _intent_
  (`answer item 3 with option 2`); the server decides everything.
- All rewards are written through `awardXp()` which is idempotent (unique `idempotency_key`)
  and enforces daily caps.

## 2. Database model (PostgreSQL / RDS)

UUID PKs (`gen_random_uuid()`), `timestamptz`, `date` for learning days (Asia/Riyadh).

| Table                                         | Purpose                                                                                                                                                         | Key constraints / indexes                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `users`                                       | identity + role (`student`/`admin`), provider subject, `noon_student_id`                                                                                        | unique(`auth_provider`,`provider_subject`), unique(`noon_student_id`) |
| `auth_sessions`                               | opaque session tokens (sha-256 hashed), expiry, revocation, encrypted Noon refresh token                                                                        | unique(`token_hash`), idx(`user_id`)                                  |
| `cohorts`                                     | leaderboard scope (dev / classroom / grade / program)                                                                                                           |                                                                       |
| `student_profiles`                            | display name, avatar, grade, cohort, cached XP/level, streak state (`current_streak`, `longest_streak`, `last_qualified_date`, `streak_freezes`), word counters | PK = `user_id`                                                        |
| `vocabulary_words`                            | word, normalized word, meaning, example, relation note, difficulty 1-3, category, active                                                                        | unique(`normalized_word`), idx(`active`)                              |
| `word_synonyms` / `word_antonyms`             | normalised 1-N lists                                                                                                                                            | unique(`word_id`,`value`)                                             |
| `student_word_progress`                       | SRS state per student×word: exposure/correct/incorrect counts, box, mastery score, state, `last_seen_at`, `next_review_at`                                      | PK(`user_id`,`word_id`), idx(`user_id`,`next_review_at`)              |
| `word_of_day`                                 | global schedule per learning day (auto/manual)                                                                                                                  | unique(`day`), idx(`word_id`)                                         |
| `student_word_of_day`                         | per-student status: viewed / attempted / correct / completed / reviewed, server-held question                                                                   | unique(`user_id`,`day`)                                               |
| `practice_sessions`                           | a vocabulary mini-session; server-held items with answer key                                                                                                    | idx(`user_id`,`day`)                                                  |
| `practice_answers`                            | one answer per item (idempotent)                                                                                                                                | unique(`session_id`,`item_index`)                                     |
| `student_daily_activity`                      | one row per student per learning day: qualified?, WOD done, sessions done, mission done, XP earned, freeze used. Serves as streak history + calendar            | unique(`user_id`,`day`)                                               |
| `xp_rules`                                    | configurable XP per action + daily cap                                                                                                                          | PK(`action`)                                                          |
| `levels`                                      | configurable level thresholds                                                                                                                                   | PK(`level`)                                                           |
| `xp_transactions`                             | **ledger** — every XP grant                                                                                                                                     | unique(`idempotency_key`), idx(`user_id`,`day`)                       |
| `badges`                                      | configurable badge definitions (criteria type + threshold)                                                                                                      | unique(`code`)                                                        |
| `student_badges`                              | earned badges                                                                                                                                                   | PK(`user_id`,`badge_id`)                                              |
| `leaderboard_periods` / `leaderboard_entries` | weekly snapshots (Sunday→Saturday, Riyadh)                                                                                                                      | unique(`cohort_id`,`week_start`), unique(`period_id`,`user_id`)       |
| `noon_skill_snapshots`                        | integration cache of Noon skill summary (TTL)                                                                                                                   | PK(`user_id`)                                                         |
| `analytics_events`                            | internal analytics sink for product metrics                                                                                                                     | idx(`name`,`occurred_at`), idx(`user_id`,`occurred_at`)               |
| `audit_events`                                | admin + security audit trail                                                                                                                                    | idx(`created_at`)                                                     |
| `rate_limit_buckets`                          | fixed-window rate limiting that works across instances                                                                                                          | PK(`key`,`window_start`)                                              |

Design decisions:

- **No separate `streaks` table** — streak _state_ is 4 columns on `student_profiles`; streak
  _history_ is `student_daily_activity`. A separate table would duplicate both.
- **No `daily_missions` table** — the mission template is configuration (`features/missions/config.ts`),
  and per-day progress lives on `student_daily_activity`. A mission table can be added if Noon
  later wants admin-authored missions.
- `student_profiles.xp_total` is a cache; the ledger is the source of truth
  (`npm run xp:reconcile` can rebuild it).

## 3. Route map

| Route                                                   | Type  | Notes                                                                                                                      |
| ------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------- |
| `/login`                                                | page  | Noon SSO button; dev-only mock student/admin login (hidden in production)                                                  |
| `/api/auth/login`                                       | POST  | mock login (dev only) / start OIDC (redirect)                                                                              |
| `/api/auth/callback/noon`                               | GET   | OIDC/OAuth callback (state + nonce + PKCE)                                                                                 |
| `/api/auth/logout`                                      | POST  | revoke session                                                                                                             |
| `/`                                                     | page  | الرئيسية — مهمة اليوم, streak, XP/level, today's word, badge, vocab progress, weekly rank, "محتاج تركز على إيه؟", Noon CTA |
| `/word-of-the-day`                                      | page  | كلمة اليوم — guess-from-context → reveal → quick question                                                                  |
| `/practice`                                             | page  | تدريب الكلمات — start daily session                                                                                        |
| `/practice/[sessionId]`                                 | page  | one-card-at-a-time session runner + reward screen                                                                          |
| `/words`                                                | page  | بنك الكلمات — words by mastery state                                                                                       |
| `/progress`                                             | page  | تقدمي                                                                                                                      |
| `/achievements`                                         | page  | الإنجازات                                                                                                                  |
| `/leaderboard`                                          | page  | الترتيب (this week, cohort)                                                                                                |
| `/go/noon?skill=&src=`                                  | GET   | tracks `noon_practice_clicked`, builds deep link server-side, 302 (no open redirect)                                       |
| `/dev/noon-placeholder`                                 | page  | dev-only target when Noon URLs are not configured                                                                          |
| `/admin`                                                | page  | metrics overview                                                                                                           |
| `/admin/words`, `/admin/words/new`, `/admin/words/[id]` | pages | vocabulary CRUD                                                                                                            |
| `/admin/import`                                         | page  | CSV import                                                                                                                 |
| `/admin/word-of-day`                                    | page  | schedule + auto selection                                                                                                  |
| `/admin/badges`                                         | page  | badge config                                                                                                               |
| `/admin/xp-rules`                                       | page  | XP rules + levels                                                                                                          |
| `/admin/audit`                                          | page  | audit log                                                                                                                  |
| `/api/health`                                           | GET   | liveness + DB check for ALB/ECS                                                                                            |

## 4. Noon integration boundaries

Everything Noon-specific is behind two interfaces, chosen by env vars:

```ts
interface NoonIdentityProvider {           // features/auth/providers/types.ts
  id: 'mock' | 'oidc';
  getAuthorizationRequest(): Promise<{ url; state; nonce; codeVerifier }>; // redirect flows
  authenticate(input): Promise<NoonIdentity>;   // code exchange / mock selection
  refreshToken(refreshToken): Promise<NoonTokens>;
  getStudentProfile(tokens | subject): Promise<NoonStudentProfile>;
}

interface NoonLearningIntegration {        // features/noon-integration/types.ts
  getStudentSkillSummary(ctx): Promise<SkillSummaryResult>;  // 'available' | 'unavailable'
  getPracticeUrl(ctx, skillId?): Promise<string>;
}
```

| Concern         | MVP adapter                                                                                                                                           | Production adapter                                                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login           | `mock` for local dev (refused in production)                                                                                                          | **`citadel`** — Noon Citadel OAuth (authorize → signed token exchange → noon2-core JWT, STUDENT profile). Implemented; token-request body/signature to confirm against Noon's guide. `oidc` kept as a generic option. |
| Student profile | from mock / ID-token claims                                                                                                                           | Noon profile API — **[NOON-REQUIRED]**                                                                                                                                                                                |
| Skill heat map  | `mock` returns rows labelled **DEVELOPMENT DATA**                                                                                                     | `http` adapter skeleton; response mapping **[NOON-REQUIRED]**. If disabled/failing → `unavailable` → UI shows "شاهد نقاط قوتك وضعفك على نون" (never fake data)                                                        |
| Deep links      | `NOON_PRACTICE_URL_TEMPLATE`, `NOON_HEATMAP_URL` (dev placeholder page if unset)                                                                      | real URL formats **[NOON-REQUIRED]**                                                                                                                                                                                  |
| Skill IDs       | local registry (`verbal_analogy`, `sentence_completion`, `contextual_error`, `reading_comprehension`, `association_difference`) + `NOON_SKILL_ID_MAP` | real Noon skill IDs **[NOON-REQUIRED]**                                                                                                                                                                               |

In addition, the companion computes an **honest local signal** from its own practice data
(analogy-question accuracy → التناظر اللفظي, context-question accuracy → إكمال الجمل). It is
labelled "من تدريبك في لفظي" and is never presented as Noon's heat map.

## 5. Gamification rules (server-side, configurable in `xp_rules`)

| Action                  | XP                                             | Idempotency / cap                                                         |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| `wod_opened`            | +2                                             | once per student per day                                                  |
| `wod_answered`          | +5                                             | once per day (first submission only; resubmits rejected)                  |
| `wod_correct`           | +5                                             | once per day, only if first submission correct                            |
| `session_completed`     | +20                                            | once per day for the daily deck                                           |
| `review_correct`        | +1 per correct answer in extra review sessions | cap 30 XP/day                                                             |
| `mission_completed`     | +25                                            | once per day                                                              |
| `noon_practice_clicked` | +5                                             | once per day; click always tracked, XP only after today's mission is done |
| `streak_milestone`      | +10 / +30 / +100 at 7 / 30 / 100 days          | once per milestone per streak run                                         |

Anti-gaming: unique `idempotency_key` on the ledger, daily caps checked inside the same DB
transaction, answers locked per item (`practice_answers` unique), sessions completed once,
answer key never leaves the server, rate limits on reward endpoints, no XP for page views
beyond the single `wod_opened` grant.

**Levels** (table `levels`): مبتدئ 0 · مستكشف الكلمات 100 · صياد المعاني 300 · خبير المفردات 700 ·
محترف اللفظي 1500 · سيد الكلمات 3000.

**Streak**: a learning day (Asia/Riyadh) qualifies when the student completes كلمة اليوم **or** a
practice session. Opening the site never counts. Gap of 1 day → +1; gap > 1 → restart at 1
(unless freezes are enabled and available — logic implemented, feature-flagged off).

**Badges** (table `badges`, evaluator per `criteria_type`): بداية قوية, أسبوع من الالتزام,
عاشق الكلمات, قاموس متحرك, لا توقفني, عودة قوية, صائد المرادفات, نَفَس طويل (10 sessions).

**Leaderboard**: weekly XP (Sunday–Saturday, Riyadh) within the student's cohort; previous week
snapshotted to `leaderboard_entries` lazily on first read of a new week.

**SRS** (`features/vocabulary/srs.ts`, pluggable `SrsAlgorithm`): Leitner boxes 0-5 with
intervals 0/1/2/4/8/16 days. Correct → box+1; wrong → box 1, due next learning day, mastery −15.
States: جديدة (box 0) · قيد التعلم (1-2) · مألوفة (3-4) · متقنة (5 and ≥4 correct).

## 6. MVP implementation sequence

1. Foundation: tokens, RTL layout, Drizzle schema + migrations, seed (55+ words).
2. Auth: DB sessions, mock provider, OIDC provider skeleton, DAL guards, `proxy.ts`.
3. Vertical slice: dashboard → كلمة اليوم → mini session → XP → streak → reward → weak-skill
   recommendation → "تدرب على نون" (`/go/noon`).
4. Badges, leaderboard, progress, achievements, word bank.
5. Admin: words CRUD, CSV import, WOD scheduler, badges, XP rules, metrics, audit.
6. Tests for domain logic, README, Docker.

## 7. Information needed from Noon

1. **Auth (Citadel)**: ✅ protocol identified (Citadel OAuth). Still needed: a Citadel dev + prod app registration (`SYNAPSE_APP_ID/SECRET`, Student role, callback URL), and confirmation of the token request body / HMAC signing from the "Replit — Start a New App" guide.
2. **Student profile API**: endpoint, fields allowed to be stored (display name, grade, avatar),
   data-sharing / privacy agreement.
3. **Skill heat map API**: endpoint, auth (user token vs service token), response shape, skill
   taxonomy + IDs for Qudurat Verbal, mastery scale, refresh frequency, rate limits.
4. **Deep links**: URL format for (a) a skill practice page, (b) the student's heat map / learning
   area, (c) app links for iOS/Android (universal links) vs web.
5. **Cohorts**: does Noon expose class / group / program membership for leaderboards?
6. **Brand**: official design tokens (colors, font, radius), logo usage rules.
7. **Return-to-Noon attribution**: can Noon report back (webhook / query) that a student actually
   practised after clicking? Needed for the "returned to Noon after mission" metric beyond clicks.
8. **Data & compliance**: retention rules, PDPL (Saudi Personal Data Protection Law) requirements,
   hosting region constraints for RDS.
