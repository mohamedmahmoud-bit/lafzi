/**
 * Paths to the official noon brand assets (from the "Ink & Light" brand pack, copied into
 * public/brand). The demo build swaps this module for inlined copies.
 */
export const AVATAR_KEYS = [
  "gazelle", "owl", "fox", "falcon", "lion", "camel", "dolphin", "horse", "butterfly", "turtle",
  "shemagh", "hijab_teal", "hijab_clay", "cap", "headphones", "astronaut", "scholar", "hijab_sand",
] as const;

export type AvatarKey = (typeof AVATAR_KEYS)[number];
export type Gender = "male" | "female";

/** Who each avatar depicts (by the picture, not the file name): girls, boys, or anyone. */
export const AVATAR_GENDER: Record<AvatarKey, Gender | "any"> = {
  hijab_teal: "female", hijab_clay: "female", hijab_sand: "female", gazelle: "female", fox: "female", butterfly: "female", dolphin: "female", turtle: "female",
  shemagh: "male", falcon: "male", lion: "male", cap: "male", headphones: "male", scholar: "male", owl: "male", horse: "male", camel: "male",
  astronaut: "any",
};
export const DEFAULT_AVATAR: Record<Gender, AvatarKey> = { male: "owl", female: "gazelle" };

/** Avatars a student may pick: girls see girls' avatars, boys see boys' (everyone sees «any»). */
export function avatarsFor(gender: Gender | null | undefined): AvatarKey[] {
  if (!gender) return [...AVATAR_KEYS];
  return AVATAR_KEYS.filter((k) => AVATAR_GENDER[k] === gender || AVATAR_GENDER[k] === "any");
}

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
