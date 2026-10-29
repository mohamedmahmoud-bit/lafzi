import { BarChart3, BookOpenText, Gamepad2, Home, Medal, Sparkles, Trophy } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "الرئيسية", icon: Home, mobile: true },
  { href: "/word-of-the-day", label: "كلمة اليوم", icon: Sparkles, mobile: true },
  { href: "/play", label: "العب", icon: Gamepad2, mobile: true },
  { href: "/study", label: "ذاكر مع نون", short: "ذاكر", icon: BookOpenText, mobile: true },
  { href: "/progress", label: "تقدمي", icon: BarChart3, mobile: false },
  { href: "/achievements", label: "الإنجازات", icon: Medal, mobile: false },
  { href: "/leaderboard", label: "الترتيب", icon: Trophy, mobile: true },
] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
