# لفظي — Noon Verbal Aptitude Companion

A gamified daily companion for Saudi high-school students preparing for the **Arabic Verbal
(لفظي) section of Qudurat**. It is built to send students back to Noon Academy, not to replace it:

> Learn a little every day → build vocabulary → keep the streak → find weak skills →
> **go back to Noon and practise exactly those skills.**

The core loop:

```
Login → مهمة اليوم → كلمة اليوم (a real Noon question) + لعبة اليوم (6 games on the Noon bank)
      → XP + streak + level/badges + weekly topic challenge
      → weakest subskill (local) → ذاكر مع نون → play again → «تدرب على نون» (verified links only)
```

**Content rule:** every question, answer, explanation and vocabulary word comes from the official
Noon question bank — synced, validated and approved by a reviewer. Nothing is generated. When the
bank has nothing published for a game, the student sees "content unavailable", not a substitute.

Teaching approach: students reason before they are told — warm-up strategy prompts before a game,
"why is the other option more precise?" after a mistake, the word of the day is met inside its
original Noon question before its relation card is revealed.

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the full architecture, database model,
route map, Noon integration boundaries, gamification rules and the list of information needed
from Noon.

---

## Tech stack

| Layer      | Choice                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------- |
| App        | Next.js 16 (App Router, Server Components, Server Actions, `proxy.ts`), React 19, TypeScript  |
| UI         | Tailwind CSS 4, shadcn-style primitives (`src/components/ui`), lucide icons, Arabic-first RTL |
| Data       | PostgreSQL 16 (AWS RDS in production), Drizzle ORM + drizzle-kit migrations                   |
| Validation | Zod (env, server actions, admin forms, CSV)                                                   |
| Auth       | Pluggable `NoonIdentityProvider` — `mock` (dev only) / `oidc` (standard OIDC + PKCE)          |
| Tests      | Vitest — pure domain tests + Postgres integration tests                                       |
| Ops        | Dockerfile (standalone output), docker-compose, `/api/health`                                 |

## Project structure

```
src/
  app/                    routes only (UI): (student) — /, /play, /study, /word-of-the-day…;
                          admin/ (question-bank, vocabulary, integrations/noon, study…); api/; go/noon
  components/ui           design-system primitives (Button, Card, Progress, Pill, Num/Xp)
  components/app          product components (header, nav, ChoiceList, RewardPanel…)
  db/                     schema.ts, client, migrate, seeds (content / platform / mock bank), reconcile-xp
  features/
    curriculum/           canonical taxonomy = Noon's verbal curriculum (official IDs)
    question-bank/        provider adapters, normalise/hash, validation, sync, review pipeline, pool
    games/                registry (A–F), pure engine (scoring/difficulty/mastery), sessions
    word-bank/            vocabulary extraction from Noon questions, review, WOD
    noon-practice/        allowlist/PII policy, verification status, resolver
    study/                ذاكر مع نون resources + storage providers
    competitions/         weekly topic challenges
    auth/ gamification/ streaks/ missions/ badges/ leaderboard/ progress/ analytics/ admin/
    vocabulary/ noon-integration/   legacy modules kept only for the static demo build
  lib/                    env, time (Riyadh), rate limiting, crypto, utils
tests/unit, tests/integration
drizzle/                  generated SQL migrations (additive)
```

Business logic never lives in React components. Pure functions (streaks, XP, SRS, badges,
ranking, deck planning, focus selection) are unit-tested; services wrap them with DB access.

---

## Local setup

Requirements: Node 22+, PostgreSQL 16 (local or `docker compose up db`).

```bash
npm install
cp .env.example .env            # defaults work for local Postgres lafzi/lafzi
# create DBs once (or use docker compose up db):
#   createuser -P lafzi && createdb -O lafzi lafzi && createdb -O lafzi lafzi_test
npm run db:migrate              # apply migrations
npm run db:seed                 # 64 words, badges, levels, XP rules, demo users, mock cohort
npm run dev                     # http://localhost:3000
```

### Demo experience (mock login)

Open `/login` — a clearly labelled **development** panel offers three personas:

| Persona           | What you see                                                                                                                                                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **سارة (تجريبي)** | 4-day streak ending yesterday ("اليوم الخامس"), 255 XP (45 XP from level 3), 22 words in progress, some due today, 2 badges, mid-table in the weekly cohort, mock Noon heat map where **إكمال الجمل** is weakest. Completing today's mission extends the streak to 5, levels up to «صياد المعاني», earns «نَفَس طويل», and ends on the Noon CTA. |
| **طالب جديد**     | Empty state: first mission, no words, joins the cohort leaderboard.                                                                                                                                                                                                                                                                              |
| **مشرف المحتوى**  | Admin area `/admin`: metrics, words, CSV import, word-of-day schedule, badges, XP rules, audit log.                                                                                                                                                                                                                                              |

`npm run db:seed` resets everything to this state.

### Scripts

| Script                                  | Purpose                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`       | Next.js                                                                                           |
| `npm run lint` / `typecheck` / `format` | ESLint / tsc / Prettier                                                                           |
| `npm test`                              | Unit + integration tests (integration runs when `DATABASE_URL_TEST` is set; it **wipes** that DB) |
| `npm run db:generate`                   | Generate a migration after editing `src/db/schema.ts`                                             |
| `npm run db:migrate`                    | Apply migrations                                                                                  |
| `npm run db:seed`                       | Reset data to the demo state (refuses in production)                                              |
| `npm run db:reset`                      | Drop schema + migrate + seed (dev only)                                                           |
| `npm run xp:reconcile`                  | Rebuild cached XP/levels from the XP ledger                                                       |

---

## Environment variables

All configuration is via env vars (`src/lib/env.ts` validates them with Zod). See `.env.example`.

| Variable                                                              | Notes                                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`                                                        | Postgres connection string                                          |
| `DATABASE_SSL` / `DATABASE_SSL_CA_PATH`                               | `require` + RDS CA bundle path in production                        |
| `APP_URL`                                                             | Public base URL (redirects, origin checks)                          |
| `SESSION_SECRET`                                                      | ≥32 random bytes; encrypts stored Noon refresh tokens               |
| `AUTH_PROVIDER`                                                       | `mock` (dev only) or `oidc`                                         |
| `NOON_AUTH_*`                                                         | Client id/secret, issuer, redirect URI, scopes, claim names         |
| `ADMIN_NOON_STUDENT_IDS`                                              | Comma list of Noon ids that receive the admin role                  |
| `NOON_QB_PROVIDER` (+ `NOON_QB_*`)                                    | Question-bank source: `none` / `mock` (dev) / `http` / `file`       |
| `NOON_QB_CHAPTERS`                                                    | Noon chapter ids reconciled on each sync                            |
| `CRON_SECRET`                                                         | Protects `/api/cron/question-sync`                                  |
| `NOON_PRACTICE_ALLOWED_HOSTS`                                         | Only hosts a «تدرب على نون» link may ever open                      |
| `STREAK_FREEZE_ENABLED`                                               | Feature flag for streak freezes (logic implemented, off by default) |
| `ANALYTICS_SINKS`                                                     | `db,console` — add your own sink via `analytics.registerSink()`     |

Never commit real secrets; `.env` is git-ignored.

---

## Noon integration

> **Nothing Noon-specific is invented.** Every integration point is an adapter with a mock used
> only in development, and production refuses the mocks.

### Student sign-in with Noon accounts (Citadel)

Students sign in with their existing Noon account through **Citadel**, Noon's internal OAuth
service (`src/features/auth/providers/citadel.ts`).

1. Register the app in the Citadel portal → `https://citadel.studyatnoon.com/dashboard/replit`,
   set the allowed role to **Student**, and register the callback URL
   `https://<app-host>/api/auth/callback/noon` (must match exactly; one URL per app, so create a
   Citadel **dev** app for dev and a **prod** app for prod).
2. Configure:
   ```env
   AUTH_PROVIDER=citadel
   SYNAPSE_APP_ID=<from Citadel>
   SYNAPSE_APP_SECRET=<from Citadel>
   SYNAPSE_BASE_URL=https://citadel.studyatnoon.com
   NOON_AUTH_REDIRECT_URI=https://<app-host>/api/auth/callback/noon
   ADMIN_NOON_STUDENT_IDS=<profile ids of content admins>
   ```
3. Flow: `/login` → «الدخول بحساب نون» → `{base}/portal/oauth/authorize?app_id&redirect_uri&response_type=code&state`
   → `/api/auth/callback/noon` (state checked) → `POST {base}/api/oauth/token` (HMAC-SHA256 signed,
   `x-replit-app-id` + `x-citadel-signature`) → the noon2-core JWT at `token.accessToken` →
   the **STUDENT** profile is selected → local session.
4. Stored: Noon profile id, first name only, and the refresh token (AES-256-GCM encrypted).
   Never stored: email, phone, account details. Non-student profiles are rejected unless
   allow-listed as admins.

> **Confirm before go-live:** the exact token-request body and what the HMAC signature covers are
> in Noon's "Replit — Start a New App" Notion guide, which was not readable from the build
> environment. Both live only in `tokenRequest()` / `sign()` in `citadel.ts`. If the first real
> sign-in fails at the token step, adjust those two functions to match the guide.

Other identity options stay available: `AUTH_PROVIDER=oidc` (generic OpenID Connect) and
`mock` (local development only; refused in production).

### Weak skills

«محتاج تركز على إيه؟» uses the student's **local** performance per Noon subskill (`skill_progress`,
updated by every game) and is always labelled as لفظي data, never as Noon's official heat map. No Noon
API for reading a student's official skill map is available to this app yet.

### Noon practice links

All «تدرب على نون» buttons go through `GET /go/noon?src=…&topic=…&subskill=…`. The resolver tries
**skill practice → heat map → general practice**, and returns only destinations that an admin added
in `/admin/integrations/noon`, that pass the host allowlist and PII/token checks, and that have a
recorded passing test for a signed-in desktop student (with no later failure). Otherwise the student
sees an honest «لا يوجد رابط تدريب مباشر بعد» page. Every hand-off is logged in
`outbound_practice_events`. Details: [docs/NOON_INTEGRATION.md](docs/NOON_INTEGRATION.md).

### Question bank, games and vocabulary

Every question a student sees is an official Noon question that was synced, validated and published
by a reviewer; vocabulary is extracted from those questions and needs Noon-stated evidence plus human
approval. See [docs/QUESTION_BANK.md](docs/QUESTION_BANK.md).

---

## Gamification & anti-gaming (summary)

- XP is granted only by `awardXp()` on the server, recorded in the **`xp_transactions` ledger**
  with a unique `idempotency_key`, and limited by per-action daily caps (`xp_rules`, editable in
  admin). The profile's `xp_total` is a cache (`npm run xp:reconcile`).
- Every reward transaction locks the student's profile row first, so concurrent requests can't
  exceed caps (covered by an integration test firing 40 parallel grants).
- Answer keys never reach the browser; each answer is stored once (`practice_answers` unique),
  sessions complete once, and word-of-the-day accepts one graded attempt per day.
- Streaks count only meaningful work (word of the day **or** a practice session), using the
  **Asia/Riyadh** day boundary. Streak freezes are implemented behind `STREAK_FREEZE_ENABLED`.
- Leaderboards are **weekly** (Sunday→Saturday, Riyadh) per cohort; previous weeks are snapshotted.

---

## AWS / RDS production notes

- **Runtime**: build the Docker image (`output: "standalone"`) and run on ECS Fargate or App Runner
  behind an ALB; health check `GET /api/health`. Set `APP_URL` to the public origin.
- **Migrations**: run `node migrate.cjs` (bundled into the image) as a one-off ECS task before
  rolling out a new version. Never run `db:seed` against production (it refuses).
- **RDS**: PostgreSQL 16, Multi-AZ, encryption at rest, private subnets, security group only from
  the app tasks. Set `DATABASE_SSL=require` and `DATABASE_SSL_CA_PATH` to the RDS CA bundle.
  Consider RDS Proxy if many tasks scale out (pool size per task: `DATABASE_POOL_MAX`, default 10).
- **Secrets**: inject via Secrets Manager / SSM Parameter Store into the task definition.
- **Region & compliance**: confirm data residency and PDPL requirements with Noon (e.g. `me-central-1`).
- **Rate limiting** uses Postgres (works across instances). Move to ElastiCache/Redis if traffic grows.
- **Analytics**: the `db` sink powers admin metrics; add a sink for Noon's analytics platform.
- **Jobs**: weekly leaderboard snapshots are created lazily; a scheduled task is optional.

## Security

- DB-backed opaque sessions (only SHA-256 hash stored), `HttpOnly`, `SameSite=Lax`, `Secure` +
  `__Host-` prefix in production, server-side revocation on logout.
- Server Actions are origin-checked by Next.js; route handlers that mutate check `Origin`.
- `proxy.ts` is only an optimistic redirect; the Data Access Layer (`features/auth/dal.ts`) enforces
  authentication and the admin role on every request. Admin pages return 404 to non-admins.
- Zod validation for all inputs; text is NFC-normalised and stripped of control/bidi-override
  characters; React escapes output; Drizzle parameterises all SQL.
- Rate limits on login, answers, session start/complete, word-of-the-day and client analytics.
- Security headers (`nosniff`, `X-Frame-Options: DENY`, referrer & permissions policy).
- Audit log for admin operations and SSO failures (`/admin/audit`).
- Leaderboards expose only first name + avatar.

## Design tokens

Colors, radius and fonts are **neutral placeholders**, not Noon's brand. Replace the `--brand-*`
CSS variables in `src/app/globals.css` and the fonts in `src/app/layout.tsx` /
`src/config/brand.ts` with Noon's official tokens; components use semantic tokens only.

## Known limitations / next steps

- **Question bank access:** the app runtime needs an authorised Noon question-bank endpoint (search
  path + auth) or an approved export, and written confirmation that questions may be copied into a
  companion app. Until then production runs with `NOON_QB_PROVIDER=none` and games show
  "content unavailable". See docs/QUESTION_BANK.md.
- **Practice links:** Noon has no documented skill-practice or heat-map link; nothing is marked
  verified. See docs/NOON_INTEGRATION.md.
- Games C, D and F are registered and their questions validate, but stay «قريبًا» until their UI is
  reviewed (an admin can flip `game_types.status`).
- Vercel Hobby only allows a daily cron; on Pro change `vercel.json` to `0 */6 * * *`.
- The static demo (`demo-site/`) shows the earlier pre-question-bank version.
- No push/email reminders yet.
