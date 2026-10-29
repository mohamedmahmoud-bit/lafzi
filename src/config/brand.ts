/**
 * Central brand configuration — noon "Ink & Light" brand pack.
 * Colours live as CSS variables in src/app/globals.css; assets in src/config/brand-assets.ts.
 */
export const brand = {
  productName: "لفظي",
  productTagline: "رفيقك اليومي للفظي القدرات",
  partnerName: "نون",
  /** Arabic display: Tajawal Bold · body: IBM Plex Sans Arabic · digits: Quicksand / IBM Plex Sans. */
  font: { ui: "IBM Plex Sans Arabic", display: "Tajawal", numbers: "Quicksand" },
  radius: "var(--brand-radius)",
} as const;
