# «تدرب على نون» — practice destinations

## Contract

```ts
interface NoonPracticeIntegration {
  resolveSkillPractice(ctx): Promise<PracticeDestination | null>;
  resolveStudentHeatmap(ctx): Promise<PracticeDestination | null>;
  resolveGeneralPractice(ctx): Promise<PracticeDestination | null>;
}
type PracticeDestination = {
  destinationId; url; type: "skill_practice" | "heatmap" | "general_practice";
  verificationStatus: "verified"; platform; verifiedAt; expiresAt;
};
```

`resolvePractice()` tries **skill (subskill mapping, then topic mapping) → heat map → general
practice**, and otherwise returns `unavailable`; `/go/noon` then shows `/noon/unavailable`, a
truthful page that names the Noon section to open manually. Every hand-off is logged in
`outbound_practice_events` (redirected | fallback).

## Rules enforced in code (`features/noon-practice/policy.ts`)

- https only (plus the `noon2://` app scheme, app platform only); host must be in
  `NOON_PRACTICE_ALLOWED_HOSTS`.
- Always blocked, even if allow-listed: `teacher.*`, `admin.*`, `presenter.*`, `citadel.*`,
  `school.noonacademy.com`, `/teacher|/admin|/presenter` paths.
- No credentials in the URL; no query/fragment keys that look like tokens or personal data
  (token, session, code, email, phone, student_id, user_id, name…). The resolver never appends
  anything about the student.
- Served only if **verified**, not expired, and matching the student's platform.
- **Verified** = a recorded pass for "desktop, signed-in student" with no failure recorded after it
  (any scenario). Scenarios: desktop signed-in, desktop signed-out, mobile browser, Noon app,
  student without the course, expired Noon session.

## Admin: `/admin/integrations/noon`

- Counts: verified destinations, all destinations, subskills without a verified destination, last
  verification.
- Editable mapping per topic and subskill: local topic → subskill → Noon chapter/topic/subtopic/
  concept ids (pre-filled from Noon's live curriculum) → destination.
- Add destination (rejected immediately if it fails the policy), record verification results per
  scenario with the observed landing page, delete.

## What Noon has documented (as of Jan 2026, #noon-devs)

Student routes on `student.noonacademy.com`, `student.noon.edu.sa`, `student.school.studyatnoon.com`:
`/course/{id}`, `/classroom/{id}`, `/assessment/{PRAASS_id}`, `/links/agenda`, `/notification`,
`/community/1`, `/downloadapp`; app scheme `noon2://assessment/{id}`.

## What is missing (why nothing is verified yet)

1. A student URL that opens practice for a specific skill / subtopic / concept.
2. A URL for the student's skill map (heat map), and whether it needs a course id.
3. Behaviour when the student is signed out, not enrolled, or has an expired session.
4. Mobile app deep links for practice.
5. An API to read the student's official skill levels (so لفظي can show Noon's map, labelled as such).

Until then all CTAs land on the honest fallback page. Local weak-skill data is always labelled as
لفظي data, never as Noon's official heat map.
