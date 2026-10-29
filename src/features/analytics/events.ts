export const ANALYTICS_EVENTS = [
  "login",
  "logout",
  "dashboard_viewed",
  "word_of_day_viewed",
  "word_of_day_guessed",
  "word_of_day_completed",
  "vocabulary_session_started",
  "vocabulary_session_completed",
  "daily_mission_completed",
  "xp_awarded",
  "level_up",
  "streak_extended",
  "badge_earned",
  "leaderboard_viewed",
  "progress_viewed",
  "noon_heatmap_cta_viewed",
  "noon_heatmap_cta_clicked",
  "noon_practice_clicked",
  "noon_practice_unavailable",
  "game_started",
  "game_completed",
  "study_resource_opened",
  "question_bank_synced",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

/** Events the browser may report (everything else is emitted server-side only). */
export const CLIENT_REPORTABLE_EVENTS = [
  "noon_heatmap_cta_viewed",
] as const satisfies readonly AnalyticsEventName[];
