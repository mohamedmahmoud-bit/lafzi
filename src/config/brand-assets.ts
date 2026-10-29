/**
 * Paths to the official noon brand assets (from the "Ink & Light" brand pack, copied into
 * public/brand). The demo build swaps this module for inlined copies.
 */
export const AVATAR_KEYS = ["gazelle", "owl", "fox", "falcon", "lion", "camel", "dolphin", "horse", "butterfly", "turtle"] as const;

export type IllustrationName =
  | "char_pose_think"
  | "char_pose_thumbs"
  | "char_pose_book"
  | "char_pose_laptop"
  | "char_pose_wave_hijab"
  | "char_pose_question"
  | "scene_celebration"
  | "scene_reading";

export const brandAssets = {
  logo: "/brand/noon-logo.png",
  smile: "/brand/smile.png",
  avatar: (key: string) => `/brand/avatars/${(AVATAR_KEYS as readonly string[]).includes(key) ? key : "owl"}.svg`,
  illustration: (name: IllustrationName) => `/brand/ill/${name}.svg`,
};
