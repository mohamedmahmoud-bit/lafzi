/**
 * مهمة اليوم — the daily mission template. Kept as configuration (not a table) for the MVP;
 * see docs/ARCHITECTURE.md §2.
 */
export const MISSION_TASKS = [
  { id: "word_of_day", title: "كلمة اليوم", detail: "خمّن المعنى ثم ثبّته بسؤال", minutes: 1 },
  {
    id: "daily_session",
    title: "تدريب اليوم",
    detail: "كلمات جديدة + مراجعات سريعة + تحدٍّ لفظي",
    minutes: 5,
  },
] as const;

export type MissionTaskId = (typeof MISSION_TASKS)[number]["id"];

export const MISSION_MINUTES = { min: 3, max: 7 };

export type MissionProgress = {
  tasks: { id: MissionTaskId; title: string; detail: string; done: boolean }[];
  completed: boolean;
  doneCount: number;
};

export function missionProgress(activity: {
  wordOfDayCompleted: boolean;
  dailySessionCompleted: boolean;
}): MissionProgress {
  const done: Record<MissionTaskId, boolean> = {
    word_of_day: activity.wordOfDayCompleted,
    daily_session: activity.dailySessionCompleted,
  };
  const tasks = MISSION_TASKS.map((t) => ({
    id: t.id,
    title: t.title,
    detail: t.detail,
    done: done[t.id],
  }));
  const doneCount = tasks.filter((t) => t.done).length;
  return { tasks, doneCount, completed: doneCount === tasks.length };
}
