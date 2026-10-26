import { BarChart3, BookOpenText, Home, Medal, Sparkles, Trophy } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "الرئيسية", icon: Home, mobile: true },
  { href: "/word-of-the-day", label: "كلمة اليوم", icon: Sparkles, mobile: true },
  { href: "/practice", label: "تدريب الكلمات", short: "تدريب", icon: BookOpenText, mobile: true },
  { href: "/progress", label: "تقدمي", icon: BarChart3, mobile: true },
  { href: "/achievements", label: "الإنجازات", icon: Medal, mobile: false },
  { href: "/leaderboard", label: "الترتيب", icon: Trophy, mobile: true },
] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
