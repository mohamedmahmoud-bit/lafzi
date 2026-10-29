/** Stand-ins for the server services the real pages import. */
import * as e from "../engine";
export { noonGoHref } from "@/features/noon-integration/urls";

export const getDashboard = async () => e.getDashboard();
export const getMasteryBreakdown = async () => e.getMasteryBreakdown();
export const getNoonFocus = async () => e.getNoonFocus();
export const getStudentWod = async () => e.getStudentWod();
export const getSessionView = async (_userId: string, id: string) => e.getSessionView(id);
export const getWeeklyLeaderboard = async () => e.getWeeklyLeaderboard();
export const getProgress = async () => e.getProgress();
export const listBadgesForStudent = async () => e.listBadges();
export const latestBadge = async () => e.latestBadge();
