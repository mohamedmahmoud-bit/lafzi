import { Gamepad2, Home, Sparkles, Trophy, UserRound, Users } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "الرئيسية", icon: Home, mobile: true },
  { href: "/play", label: "العب", icon: Gamepad2, mobile: true },
  { href: "/word-of-the-day", label: "كلمة اليوم", icon: Sparkles, mobile: false },
  { href: "/friends", label: "الأصدقاء", icon: Users, mobile: true },
  { href: "/leaderboard", label: "الترتيب", icon: Trophy, mobile: true },
  { href: "/profile", label: "ملفي", icon: UserRound, mobile: true },
] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
