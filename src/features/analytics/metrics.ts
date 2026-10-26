import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { addDays, learningDay } from "@/lib/time";

type Row = Record<string, unknown>;
async function q<T extends Row>(query: ReturnType<typeof sql>): Promise<T[]> {
  return (await getDb().execute(query)).rows as T[];
}
const ratio = (num: number, den: number) => (den > 0 ? num / den : null);

/**
 * Key product metrics. All computed from first-party
 * tables so they work without an external analytics provider.
 * "Active" = a student with any tracked event on that learning day.
 */
export async function getProductMetrics(days = 14) {
  const today = learningDay();
  const since = addDays(today, -(days - 1));
  const week = addDays(today, -6);

  const dau = await q<{ day: string; users: number }>(sql`
    select day::text, count(distinct user_id)::int as users
    from analytics_events where day >= ${since} and user_id is not null
    group by day order by day`);

  const [rates] = await q<{ active: number; mission: number; wod: number }>(sql`
    with active as (
      select distinct user_id, day from analytics_events where day >= ${week} and user_id is not null
    )
    select
      (select count(*) from active)::int as active,
      (select count(*) from student_daily_activity d join active a using (user_id, day) where d.mission_completed_at is not null)::int as mission,
      (select count(*) from student_daily_activity d join active a using (user_id, day) where d.word_of_day_completed)::int as wod`);

  // Retention over students whose first qualifying day is in the window (excluding the last 7 days for D7).
  const [ret] = await q<{ d1_base: number; d1: number; d7_base: number; d7: number }>(sql`
    with firsts as (
      select user_id, min(day) as first_day from student_daily_activity where qualified group by user_id
    )
    select
      count(*) filter (where first_day <= ${addDays(today, -1)})::int as d1_base,
      count(*) filter (where first_day <= ${addDays(today, -1)} and exists (
        select 1 from student_daily_activity d where d.user_id = f.user_id and d.qualified and d.day = f.first_day + 1))::int as d1,
      count(*) filter (where first_day <= ${addDays(today, -7)})::int as d7_base,
      count(*) filter (where first_day <= ${addDays(today, -7)} and exists (
        select 1 from student_daily_activity d where d.user_id = f.user_id and d.qualified and d.day = f.first_day + 7))::int as d7
    from firsts f`);

  const [streaks] = await q<{ s3: number; s7: number; students: number }>(sql`
    select
      count(*) filter (where current_streak >= 3 and last_qualified_date >= ${addDays(today, -1)})::int as s3,
      count(*) filter (where current_streak >= 7 and last_qualified_date >= ${addDays(today, -1)})::int as s7,
      count(*)::int as students
    from student_profiles p join users u on u.id = p.user_id where u.role = 'student'`);

  const [learning] = await q<{ sessions: number; mastered: number }>(sql`
    select
      (select count(*) from practice_sessions where status = 'completed' and day >= ${week})::int as sessions,
      (select count(*) from student_word_progress where state = 'mastered')::int as mastered`);

  const [noon] = await q<{
    viewed: number;
    clicked: number;
    practice_clicks: number;
    mission_days: number;
    mission_then_noon: number;
  }>(sql`
    select
      (select count(distinct (user_id, day)) from analytics_events where name = 'noon_heatmap_cta_viewed' and day >= ${week})::int as viewed,
      (select count(distinct (user_id, day)) from analytics_events where name = 'noon_heatmap_cta_clicked' and day >= ${week})::int as clicked,
      (select count(*) from analytics_events where name = 'noon_practice_clicked' and day >= ${week})::int as practice_clicks,
      (select count(*) from student_daily_activity where mission_completed_at is not null and day >= ${week})::int as mission_days,
      (select count(*) from student_daily_activity d where d.mission_completed_at is not null and d.day >= ${week}
         and exists (select 1 from analytics_events e where e.user_id = d.user_id and e.day = d.day
                     and e.name = 'noon_practice_clicked'))::int as mission_then_noon`);

  return {
    window: { since, today, week },
    dau,
    dauToday: dau.find((d) => d.day === today)?.users ?? 0,
    missionCompletionRate: ratio(rates.mission, rates.active),
    wodCompletionRate: ratio(rates.wod, rates.active),
    d1Retention: ratio(ret.d1, ret.d1_base),
    d7Retention: ratio(ret.d7, ret.d7_base),
    streak3: streaks.s3,
    streak7: streaks.s7,
    students: streaks.students,
    sessions7d: learning.sessions,
    wordsMastered: learning.mastered,
    noonCtaCtr: ratio(noon.clicked, noon.viewed),
    noonPracticeClicks7d: noon.practice_clicks,
    /** The north-star: share of mission completions followed by a Noon hand-off the same day. */
    returnToNoonAfterMission: ratio(noon.mission_then_noon, noon.mission_days),
  };
}
