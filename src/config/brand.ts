/**
 * Central brand configuration. Values are PLACEHOLDERS until Noon provides official tokens,
 * fonts and logo usage rules. Colors live as CSS variables in src/app/globals.css (`--brand-*`)
 * so they can be swapped without touching components.
 */
export const brand = {
  productName: "لفظي",
  productTagline: "رفيقك اليومي للفظي القدرات",
  partnerName: "نون",
  /** UI + display fonts (next/font/google). Swap for Noon's typeface when provided. */
  font: { ui: "IBM Plex Sans Arabic", display: "Noto Naskh Arabic" },
  radius: "var(--brand-radius)",
} as const;

export const AVATARS: Record<string, string> = {
  owl: "🦉",
  fox: "🦊",
  falcon: "🦅",
  gazelle: "🦌",
  lion: "🦁",
  camel: "🐪",
  dolphin: "🐬",
  horse: "🐎",
  butterfly: "🦋",
  turtle: "🐢",
};

export const avatarEmoji = (key: string) => AVATARS[key] ?? "🙂";
