/**
 * In-browser demo engine. Mirrors the server services (src/features/**) using the SAME pure domain
 * logic — streaks, XP rules, levels, SRS, deck planning, question generation, badges, ranking and
 * the Noon focus choice — but keeps state in memory + localStorage instead of Postgres.
 * Used only by the shareable demo build (demo/build.mjs); the real app never imports it.
 */
import type { StoredQuestion } from "@/db/schema";
import { MOCK_CLASSMATES, SEED_BADGES, SEED_WORDS } from "@/db/seed-data/words";
import { badgeProgress, newlyEarned, type BadgeStats } from "@/features/badges/criteria";
import { levelFor } from "@/features/gamification/levels";
import { RewardCollector, type RewardSummary } from "@/features/gamification/rewards";
import { computeAward, DEFAULT_XP_RULES, milestoneMultiplier, type XpAction } from "@/features/gamification/xp-rules";
import { rankRows, xpToNextRank } from "@/features/leaderboard/ranking";
import { MISSION_MINUTES, missionProgress } from "@/features/missions/config";
import { chooseFocusSkill, type LocalSkillSignal } from "@/features/noon-integration/focus";
import { MockNoonLearningIntegration } from "@/features/noon-integration/mock";
import { QUESTION_TYPE_TO_SKILL } from "@/features/noon-integration/skills";
import { noonGoHref } from "@/features/noon-integration/urls";
import { applyQualifiedActivity, displayStreak, reachedMilestone } from "@/features/streaks/streak";
import { planDeck, type DeckKind } from "@/features/vocabulary/deck";
import { buildFirstPossible, buildQuestion, toClientQuestion, type QuizWord } from "@/features/vocabulary/questions";
import { BOX_INTERVAL_DAYS, emptyProgress, leitnerSrs, stateFor, type MasteryState, type SrsProgress } from "@/features/vocabulary/srs";
import { addDays, daysBetween, lastNDays, learningDay, startOfLearningDay, weekRange } from "@/lib/time";
import { hashString, seededRandom } from "@/lib/utils";

// ─── Content ────────────────────────────────────────────────────────────────
export type DemoWord = QuizWord & { relationNote: string | null; category: string };
export const WORDS: DemoWord[] = SEED_WORDS.map((w, i) => ({
  id: `w${i}`,
  word: w.word,
  meaning: w.meaning,
  example: w.example,
  synonyms: [...w.synonyms],
  antonyms: [...w.antonyms],
  difficulty: w.difficulty,
  relationNote: w.relationNote ?? null,
  category: w.category,
}));
const byId = new Map(WORDS.map((w) => [w.id, w]));
const BADGE_DEFS = SEED_BADGES.map((b) => ({ ...b, id: b.code, enabled: true }));

// ─── State ──────────────────────────────────────────────────────────────────
type WP = Omit<SrsProgress, "lastSeenAt" | "nextReviewAt"> & { lastSeenAt: string | null; nextReviewAt: string | null; synonymCorrect: number };
type Act = { qualified: boolean; wod: boolean; sessions: number; missionAt: string | null; xp: number };
type Sess = {
  id: string; day: string; kind: DeckKind; status: "in_progress" | "completed";
  items: StoredQuestion[]; answers: Record<number, { opt: string; correct: boolean; type: string }>; correctCount: number;
};
type Wod = {
  wordId: string; guess: StoredQuestion; q: StoredQuestion; guessOpt: string | null;
  attemptedAt: string | null; selected: string | null; isCorrect: boolean | null;
};
export type Persona = "demo-student" | "new-student";
type State = {
  v: 1; persona: Persona; noonStudentId: string;
  profile: { displayName: string; avatar: string; xp: number; level: number; streak: number; longest: number; lastQ: string | null };
  progress: Record<string, WP>; activity: Record<string, Act>;
  ledger: { key: string; action: XpAction; xp: number; day: string }[];
  badges: Record<string, string>; sessions: Record<string, Sess>; histSessions: number;
  wod: Record<string, Wod>;
  classmates: { id: string; name: string; avatar: string; weekXp: number; lastWeekXp: number; weekStart: string }[];
};

const KEY = "lafzi-demo-v1";
let state: State | null = load();
let version = 0;
const listeners = new Set<() => void>();

function load(): State | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as State) : null;
  } catch {
    return null;
  }
}
function save() {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: demo still works for this visit */
  }
  version++;
  listeners.forEach((l) => l());
}
export const store = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  version: () => version,
  bump: () => {
    version++;
    listeners.forEach((l) => l());
  },
};
function st(): State {
  if (!state) throw new Error("not signed in");
  // Weekly classmates XP resets on Sunday like the real leaderboard.
  const ws = weekRange(learningDay()).start;
  for (const c of state.classmates) {
    if (c.weekStart !== ws) Object.assign(c, { lastWeekXp: c.weekXp, weekXp: 20 + (hashString(c.id + ws) % 120), weekStart: ws });
  }
  return state;
}

// ─── Personas ───────────────────────────────────────────────────────────────
function wodWordId(day: string) {
  return WORDS[hashString(`wod:${day}`) % WORDS.length].id;
}

export function signIn(persona: Persona) {
  const today = learningDay();
  const ws = weekRange(today).start;
  const rand = seededRandom(hashString(persona + today));
  const s: State = {
    v: 1, persona, noonStudentId: persona === "demo-student" ? "DEV-NOON-1001" : "DEV-NOON-1999",
    profile: persona === "demo-student"
      ? { displayName: "سارة", avatar: "gazelle", xp: 0, level: 1, streak: 4, longest: 6, lastQ: addDays(today, -1) }
      : { displayName: "طالب جديد", avatar: "owl", xp: 0, level: 1, streak: 0, longest: 0, lastQ: null },
    progress: {}, activity: {}, ledger: [], badges: {}, sessions: {}, histSessions: 0, wod: {},
    classmates: MOCK_CLASSMATES.map((c, i) => ({
      id: `c${i}`, name: c.name, avatar: c.avatar, weekXp: c.weekXp, lastWeekXp: Math.round(60 + rand() * 200), weekStart: ws,
    })),
  };
  if (persona === "demo-student") {
    const days = [-10, -4, -3, -2, -1].map((d) => addDays(today, d));
    const acts: [XpAction, number][] = [["wod_opened", 2], ["wod_answered", 5], ["wod_correct", 5], ["session_completed", 20], ["mission_completed", 25]];
    for (const day of days) {
      for (const [action, xp] of acts) s.ledger.push({ key: `${action}:${day}`, action, xp, day });
      s.activity[day] = { qualified: true, wod: true, sessions: 1, missionAt: startOfLearningDay(day).toISOString(), xp: 57 };
    }
    s.ledger.push({ key: "seed_topup", action: "review_correct", xp: 255 - 57 * days.length, day: addDays(today, -12) });
    s.profile.xp = 255;
    s.profile.level = levelFor(255).current.level;
    s.histSessions = 9; // today's session earns «نَفَس طويل» (10 sessions)
    s.badges.first_step = new Date(Date.now() - 10 * 86_400_000).toISOString();
    s.badges.streak_3 = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const skip = wodWordId(today);
    const now = Date.now();
    WORDS.filter((w) => w.id !== skip).slice(0, 22).forEach((w, i) => {
      const box = [1, 2, 2, 3, 3, 4, 5, 5][i % 8];
      const correctCount = box + (box === 5 ? 1 : 0);
      s.progress[w.id] = {
        box, state: stateFor(box, correctCount), exposureCount: correctCount + (i % 3), correctCount,
        incorrectCount: i % 3, masteryScore: Math.min(100, box * 20 - (i % 3) * 10),
        synonymCorrect: Math.floor(correctCount / 3),
        lastSeenAt: new Date(now - (BOX_INTERVAL_DAYS[box] + 1) * 86_400_000).toISOString(),
        nextReviewAt: new Date(i % 4 === 0 ? now - 3_600_000 : now + BOX_INTERVAL_DAYS[box] * 86_400_000).toISOString(),
      };
    });
  }
  // Keep the student mid-table so the demo shows a climb (classmates scale with the student's week).
  const week = weekRange(today);
  const mine = s.ledger.filter((l) => l.day >= week.start && l.day <= week.end).reduce((a, l) => a + l.xp, 0);
  for (const c of s.classmates) c.weekXp = Math.round(c.weekXp * (1 + mine / 120));
  state = s;
  save();
}
export function signOut() {
  state = null;
  save();
}
export function currentUser() {
  if (!state) return null;
  return {
    id: `demo-${state.persona}`, role: "student" as const, noonStudentId: state.noonStudentId,
    displayName: state.profile.displayName, avatar: state.profile.avatar, cohortId: "demo",
  };
}
export function headerStats() {
  const s = st();
  return { streak: displayStreak({ currentStreak: s.profile.streak, lastQualifiedDate: s.profile.lastQ }, learningDay()).count, xp: s.profile.xp };
}

// ─── Reward engine (mirrors xp.service / streaks / missions / badges) ──────
function act(s: State, day: string): Act {
  return (s.activity[day] ??= { qualified: false, wod: false, sessions: 0, missionAt: null, xp: 0 });
}
function awardXp(s: State, action: XpAction, key: string, day: string, rewards?: RewardCollector, mult = 1): number {
  if (s.ledger.some((l) => l.key === key)) return 0; // idempotency
  const earned = s.ledger.filter((l) => l.day === day && l.action === action).reduce((a, l) => a + l.xp, 0);
  const amount = computeAward(DEFAULT_XP_RULES[action], earned, mult);
  if (amount <= 0) return 0;
  s.ledger.push({ key, action, xp: amount, day });
  s.profile.xp += amount;
  act(s, day).xp += amount;
  const lvl = levelFor(s.profile.xp).current;
  if (lvl.level > s.profile.level && rewards) rewards.levelUp = { from: s.profile.level, to: lvl.level, name: lvl.name };
  s.profile.level = lvl.level;
  rewards?.awards.push({ action, xp: amount });
  return amount;
}
function recordQualified(s: State, day: string, rewards: RewardCollector) {
  const r = applyQualifiedActivity(
    { currentStreak: s.profile.streak, longestStreak: s.profile.longest, lastQualifiedDate: s.profile.lastQ, streakFreezes: 0 },
    day,
  );
  act(s, day).qualified = true;
  if (r.outcome === "same_day") {
    rewards.streak ??= r;
    return;
  }
  Object.assign(s.profile, { streak: r.state.currentStreak, longest: r.state.longestStreak, lastQ: r.state.lastQualifiedDate });
  rewards.streak = r;
  const m = reachedMilestone(r.state.currentStreak);
  if (m) awardXp(s, "streak_milestone", `streak_milestone:${m}:${day}`, day, rewards, milestoneMultiplier(m));
}
function checkMission(s: State, day: string, rewards: RewardCollector) {
  const a = act(s, day);
  if (a.missionAt) return;
  if (!missionProgress({ wordOfDayCompleted: a.wod, dailySessionCompleted: a.sessions > 0 }).completed) return;
  a.missionAt = new Date().toISOString();
  rewards.missionCompleted = true;
  awardXp(s, "mission_completed", `mission_completed:${day}`, day, rewards);
}
function stats(s: State): BadgeStats {
  const q = Object.entries(s.activity).filter(([, a]) => a.qualified).map(([d]) => d).sort();
  const wp = Object.values(s.progress);
  return {
    qualifiedDays: q.length, currentStreak: s.profile.streak, longestStreak: s.profile.longest,
    wordsLearned: wp.filter((p) => p.correctCount > 0).length,
    wordsMastered: wp.filter((p) => p.state === "mastered").length,
    synonymCorrect: wp.reduce((a, p) => a + p.synonymCorrect, 0),
    sessionsCompleted: s.histSessions + Object.values(s.sessions).filter((x) => x.status === "completed").length,
    comebackGapDays: q.length >= 2 ? daysBetween(q[q.length - 2], q[q.length - 1]) : 0,
  };
}
function evalBadges(s: State, rewards: RewardCollector) {
  for (const d of newlyEarned(BADGE_DEFS, stats(s), new Set(Object.keys(s.badges)))) {
    s.badges[d.code] = new Date().toISOString();
    rewards.badges.push({ code: d.code, name: d.name, icon: d.icon, description: d.description });
  }
}
function recordWordAnswer(s: State, wordId: string, correct: boolean, synonym: boolean) {
  const p = s.progress[wordId];
  const prev: SrsProgress = p
    ? { ...p, lastSeenAt: p.lastSeenAt ? new Date(p.lastSeenAt) : null, nextReviewAt: p.nextReviewAt ? new Date(p.nextReviewAt) : null }
    : emptyProgress();
  const n = leitnerSrs.review(prev, correct, new Date());
  s.progress[wordId] = {
    ...n, lastSeenAt: n.lastSeenAt?.toISOString() ?? null, nextReviewAt: n.nextReviewAt?.toISOString() ?? null,
    synonymCorrect: (p?.synonymCorrect ?? 0) + (correct && synonym ? 1 : 0),
  };
}
function wordsLearned(s: State) {
  return Object.values(s.progress).filter((p) => p.correctCount > 0).length;
}
function masteredCount(s: State) {
  return Object.values(s.progress).filter((p) => p.state === "mastered").length;
}

export class DemoError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

// ─── Word of the day ─────────────────────────────────────────────────────────
function ensureWod(s: State, day: string): Wod {
  if (s.wod[day]) return s.wod[day];
  const target = byId.get(wodWordId(day))!;
  const rand = seededRandom(hashString(`${s.persona}:${day}:wod`));
  const guess = buildQuestion("meaning", target, WORDS, rand)!;
  guess.prompt = "من سياق الجملة، ماذا تتوقع أن تعني الكلمة؟";
  guess.stem = target.example;
  const q = buildFirstPossible(["synonym", "antonym"], target, WORDS, rand)!;
  s.wod[day] = { wordId: target.id, guess, q, guessOpt: null, attemptedAt: null, selected: null, isCorrect: null };
  return s.wod[day];
}
export function getStudentWod() {
  const s = st();
  const day = learningDay();
  const w = ensureWod(s, day);
  const card = byId.get(w.wordId)!;
  const answered = w.attemptedAt !== null;
  const guessed = w.guessOpt !== null;
  return {
    day, card, guess: toClientQuestion(w.guess), question: toClientQuestion(w.q),
    status: {
      guessed, guessCorrect: guessed ? w.guessOpt === w.guess.correctOptionId : null,
      guessCorrectOptionId: guessed ? w.guess.correctOptionId : null,
      answered, isCorrect: w.isCorrect, selectedOptionId: w.selected,
      correctOptionId: answered ? w.q.correctOptionId : null, explanation: answered ? w.q.explanation : null,
    },
  };
}
export function submitWodGuess(opt: string) {
  const s = st();
  const day = learningDay();
  const w = ensureWod(s, day);
  const rewards = new RewardCollector();
  const firstTime = !w.guessOpt;
  if (firstTime) w.guessOpt = opt;
  awardXp(s, "wod_opened", `wod_opened:${day}`, day, rewards);
  save();
  return { correct: w.guessOpt === w.guess.correctOptionId, correctOptionId: w.guess.correctOptionId, firstTime, xp: rewards.totalXp };
}
export function answerWod(opt: string): RewardSummary & { isCorrect: boolean; correctOptionId: string; explanation: string } {
  const s = st();
  const day = learningDay();
  const w = ensureWod(s, day);
  const rewards = new RewardCollector();
  if (!w.guessOpt) throw new DemoError("not_guessed");
  if (!w.attemptedAt) {
    const isCorrect = opt === w.q.correctOptionId;
    Object.assign(w, { attemptedAt: new Date().toISOString(), selected: opt, isCorrect });
    awardXp(s, "wod_answered", `wod_answered:${day}`, day, rewards);
    if (isCorrect) awardXp(s, "wod_correct", `wod_correct:${day}`, day, rewards);
    recordWordAnswer(s, w.wordId, isCorrect, w.q.type === "synonym");
    act(s, day).wod = true;
    recordQualified(s, day, rewards);
    checkMission(s, day, rewards);
    evalBadges(s, rewards);
    save();
  }
  return { ...rewards.toJSON(), isCorrect: !!w.isCorrect, correctOptionId: w.q.correctOptionId, explanation: w.q.explanation };
}

// ─── Practice sessions ───────────────────────────────────────────────────────
const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

export function startSession(): string {
  const s = st();
  const day = learningDay();
  const open = Object.values(s.sessions).find((x) => x.day === day && x.status === "in_progress");
  if (open) return open.id;
  const dailyDone = Object.values(s.sessions).some((x) => x.day === day && x.kind === "daily" && x.status === "completed");
  const kind: DeckKind = dailyDone ? "review" : "daily";
  const now = Date.now();
  const seen = Object.entries(s.progress).sort(([, a], [, b]) => a.masteryScore - b.masteryScore);
  const due = seen.filter(([, p]) => p.nextReviewAt && Date.parse(p.nextReviewAt) <= now).map(([id]) => id);
  const known = seen.map(([id]) => id);
  const fresh = WORDS.filter((w) => !s.progress[w.id])
    .sort((a, b) => a.difficulty - b.difficulty || hashString(a.id + s.persona) - hashString(b.id + s.persona))
    .map((w) => w.id);
  const seed = hashString(`${s.persona}:${day}:${kind}:${now}`);
  const rand = seededRandom(seed);
  const items = planDeck({ due, fresh, known }, kind, seed % 7)
    .map((slot) => buildFirstPossible(slot.types, byId.get(slot.wordId)!, WORDS, rand))
    .filter((q): q is StoredQuestion => q !== null);
  const id = uuid();
  s.sessions[id] = { id, day, kind, status: "in_progress", items, answers: {}, correctCount: 0 };
  save();
  return id;
}
export function getSessionView(id: string) {
  const s = st();
  const x = s.sessions[id];
  if (!x) return null;
  return {
    id: x.id, kind: x.kind, status: x.status, total: x.items.length,
    questions: x.items.map(toClientQuestion),
    answers: Object.entries(x.answers).map(([i, a]) => ({
      index: Number(i), selectedOptionId: a.opt, isCorrect: a.correct,
      correctOptionId: x.items[Number(i)].correctOptionId, explanation: x.items[Number(i)].explanation,
    })),
  };
}
export function answerItem(id: string, index: number, opt: string) {
  const s = st();
  const x = s.sessions[id];
  if (!x) throw new DemoError("not_found");
  const item = x.items[index];
  if (!item) throw new DemoError("bad_item");
  const prev = x.answers[index];
  if (prev) return { isCorrect: prev.correct, correctOptionId: item.correctOptionId, explanation: item.explanation, xp: 0 };
  if (x.status !== "in_progress") throw new DemoError("not_in_progress");
  const correct = opt === item.correctOptionId;
  x.answers[index] = { opt, correct, type: item.type };
  if (correct) x.correctCount++;
  recordWordAnswer(s, item.wordId, correct, item.type === "synonym" || item.type === "reverse");
  let xp = 0;
  if (correct && x.kind === "review") xp = awardXp(s, "review_correct", `review_correct:${id}:${index}`, learningDay());
  save();
  return { isCorrect: correct, correctOptionId: item.correctOptionId, explanation: item.explanation, xp };
}
export function completeSession(id: string) {
  const s = st();
  const x = s.sessions[id];
  if (!x) throw new DemoError("not_found");
  if (x.status !== "in_progress") throw new DemoError("not_in_progress");
  if (Object.keys(x.answers).length < x.items.length) throw new DemoError("incomplete");
  const day = learningDay();
  const rewards = new RewardCollector();
  x.status = "completed";
  act(s, day).sessions++;
  if (x.kind === "daily") awardXp(s, "session_completed", `session_completed:${day}`, day, rewards);
  recordQualified(s, day, rewards);
  checkMission(s, day, rewards);
  evalBadges(s, rewards);
  save();
  return { ...rewards.toJSON(), correct: x.correctCount, total: x.items.length, kind: x.kind };
}
export function practiceStatus() {
  const s = st();
  const day = learningDay();
  const list = Object.values(s.sessions).filter((x) => x.day === day);
  return {
    dailyDone: list.some((x) => x.kind === "daily" && x.status === "completed"),
    open: list.find((x) => x.status === "in_progress")?.id ?? null,
    due: Object.values(s.progress).filter((p) => p.nextReviewAt && Date.parse(p.nextReviewAt) <= Date.now()).length,
  };
}

// ─── Noon focus ──────────────────────────────────────────────────────────────
const mockNoon = new MockNoonLearningIntegration({});
export async function getNoonFocus() {
  const s = st();
  const summary = await mockNoon.getStudentSkillSummary({ userId: s.persona, noonStudentId: s.noonStudentId });
  const tally = new Map<string, { answered: number; correct: number }>();
  for (const x of Object.values(s.sessions)) {
    for (const a of Object.values(x.answers)) {
      const skill = QUESTION_TYPE_TO_SKILL[a.type];
      if (!skill) continue;
      const t = tally.get(skill) ?? { answered: 0, correct: 0 };
      t.answered++;
      if (a.correct) t.correct++;
      tally.set(skill, t);
    }
  }
  const local = [...tally].map(([skillId, t]) => ({ skillId, answered: t.answered, accuracy: t.correct / t.answered })) as LocalSkillSignal[];
  const focus = chooseFocusSkill(summary, local);
  return { summary, focus, ctaHref: (src: string) => noonGoHref(src, focus?.skillId) };
}
export function noonClick() {
  const s = st();
  const day = learningDay();
  const key = `noon_practice_clicked:${day}`;
  if (s.activity[day]?.missionAt && awardXp(s, "noon_practice_clicked", key, day) > 0) save();
  return s.ledger.find((l) => l.key === key)?.xp ?? 0;
}

// ─── Read models (mirror dashboard / leaderboard / progress / badges) ──────
export function getMasteryBreakdown() {
  const s = st();
  const counts: Record<MasteryState, number> = { new: 0, learning: 0, familiar: 0, mastered: 0 };
  for (const p of Object.values(s.progress)) counts[p.state]++;
  counts.new += WORDS.length - Object.keys(s.progress).length;
  return { counts, total: WORDS.length };
}
export function latestBadge() {
  const s = st();
  const recent = Object.entries(s.badges)
    .filter(([, at]) => Date.now() - Date.parse(at) < 14 * 86_400_000)
    .sort(([, a], [, b]) => Date.parse(b) - Date.parse(a))[0];
  if (!recent) return null;
  const d = BADGE_DEFS.find((b) => b.code === recent[0])!;
  return { name: d.name, icon: d.icon, description: d.description, earnedAt: new Date(recent[1]) };
}
function weekXp(s: State, start: string, end: string) {
  return s.ledger.filter((l) => l.day >= start && l.day <= end).reduce((a, l) => a + l.xp, 0);
}
export function getWeeklyLeaderboard() {
  const s = st();
  const today = learningDay();
  const week = weekRange(today);
  const me = { userId: "me", displayName: s.profile.displayName, avatar: s.profile.avatar, xp: weekXp(s, week.start, week.end) };
  const rows = rankRows([...s.classmates.map((c) => ({ userId: c.id, displayName: c.name, avatar: c.avatar, xp: c.weekXp })), me]);
  const prev = weekRange(addDays(week.start, -1));
  const myLast = weekXp(s, prev.start, prev.end);
  const lastRanked = rankRows([...s.classmates.map((c) => ({ userId: c.id, displayName: c.name, avatar: c.avatar, xp: c.lastWeekXp })), { ...me, xp: myLast }]);
  const lastMe = lastRanked.find((r) => r.userId === "me")!;
  return {
    week: { ...week, daysLeft: Math.max(0, daysBetween(today, week.end)) },
    rows, me: rows.find((r) => r.userId === "me") ?? null, xpToNext: xpToNextRank(rows, "me"),
    lastWeek: myLast > 0 ? { rank: lastMe.rank, xp: myLast, size: lastRanked.length } : null,
  };
}
export async function getDashboard() {
  const s = st();
  const today = learningDay();
  const a = s.activity[today];
  const w = ensureWod(s, today);
  const word = byId.get(w.wordId)!;
  const lb = getWeeklyLeaderboard();
  const mission = missionProgress({ wordOfDayCompleted: a?.wod ?? false, dailySessionCompleted: (a?.sessions ?? 0) > 0 });
  const r = DEFAULT_XP_RULES;
  return {
    today,
    profile: { displayName: s.profile.displayName, avatar: s.profile.avatar, xpTotal: s.profile.xp, wordsLearned: wordsLearned(s), masteredWords: masteredCount(s) },
    level: levelFor(s.profile.xp),
    streak: displayStreak({ currentStreak: s.profile.streak, lastQualifiedDate: s.profile.lastQ }, today),
    longestStreak: s.profile.longest,
    xpToday: a?.xp ?? 0,
    mission: { ...mission, minutes: MISSION_MINUTES, missionXp: r.wod_opened.xp + r.wod_answered.xp + r.wod_correct.xp + r.session_completed.xp + r.mission_completed.xp },
    wod: { word: word.word, meaning: w.guessOpt ? word.meaning : null, guessed: !!w.guessOpt, completed: !!w.attemptedAt },
    badge: latestBadge(),
    leaderboard: { rank: lb.me?.rank ?? null, size: lb.rows.length, weekXp: lb.me?.xp ?? 0, xpToNext: lb.xpToNext },
    noon: await getNoonFocus(),
    mastery: getMasteryBreakdown(),
  };
}
export function getProgress() {
  const s = st();
  const today = learningDay();
  const week = weekRange(today);
  const xpBy = (day: string) => s.ledger.filter((l) => l.day === day).reduce((a, l) => a + l.xp, 0);
  return {
    today,
    streak: displayStreak({ currentStreak: s.profile.streak, lastQualifiedDate: s.profile.lastQ }, today),
    longestStreak: s.profile.longest, level: levelFor(s.profile.xp), xpTotal: s.profile.xp,
    weekXp: weekXp(s, week.start, week.end),
    learningDays: Object.values(s.activity).filter((x) => x.qualified).length,
    sessions: stats(s).sessionsCompleted, wordsLearned: wordsLearned(s), masteredWords: masteredCount(s),
    mastery: getMasteryBreakdown(),
    last7: lastNDays(today, 7).map((day) => ({ day, xp: xpBy(day), qualified: s.activity[day]?.qualified ?? false })),
    calendar: lastNDays(week.end, 35).map((day) => ({
      day, future: day > today, qualified: s.activity[day]?.qualified ?? false, mission: !!s.activity[day]?.missionAt,
    })),
  };
}
export function listBadges() {
  const s = st();
  const sts = stats(s);
  return BADGE_DEFS.map((d) => ({
    id: d.code, code: d.code, name: d.name, description: d.description, icon: d.icon,
    earnedAt: s.badges[d.code] ? new Date(s.badges[d.code]) : null,
    progress: (s.badges[d.code] ? [d.threshold, d.threshold] : badgeProgress(d, sts)) as [number, number],
  }));
}
export function wordBank(filter: MasteryState | null) {
  const s = st();
  return Object.entries(s.progress)
    .filter(([, p]) => !filter || p.state === filter)
    .sort(([, a], [, b]) => (a.nextReviewAt ?? "").localeCompare(b.nextReviewAt ?? ""))
    .map(([id, p]) => ({ id, word: byId.get(id)!.word, meaning: byId.get(id)!.meaning, state: p.state, due: !!p.nextReviewAt && Date.parse(p.nextReviewAt) <= Date.now() }));
}
