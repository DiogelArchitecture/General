// A single shared taxonomy used for BOTH irritations and happy logs.
// The model reasons about *which theme matters*, never *what the complaint was*.
// Keep ids stable (stored in the DB); labels/descriptions can be tuned.

export type ThemeId =
  | "affection"
  | "appreciation"
  | "quality_time"
  | "home_tidiness"
  | "help_chores"
  | "listening"
  | "thoughtfulness"
  | "space"
  | "communication"
  | "fun";

export interface Theme {
  id: ThemeId;
  label: string;
  blurb: string;
}

export const THEMES: Theme[] = [
  { id: "affection", label: "Affection", blurb: "Warmth, touch, closeness" },
  { id: "appreciation", label: "Appreciation", blurb: "Feeling seen and thanked" },
  { id: "quality_time", label: "Quality time", blurb: "Undistracted time together" },
  { id: "home_tidiness", label: "Home & tidiness", blurb: "The shared space" },
  { id: "help_chores", label: "Help & chores", blurb: "Sharing the load" },
  { id: "listening", label: "Listening & attention", blurb: "Being heard" },
  { id: "thoughtfulness", label: "Thoughtfulness", blurb: "Small considerate acts" },
  { id: "space", label: "Space & independence", blurb: "Room to be yourself" },
  { id: "communication", label: "Communication", blurb: "Talking things through" },
  { id: "fun", label: "Fun & playfulness", blurb: "Lightness and laughter" },
];

export const THEME_IDS = THEMES.map((t) => t.id) as ThemeId[];

const THEME_BY_ID = new Map(THEMES.map((t) => [t.id, t]));

export function themeLabel(id: string): string {
  return THEME_BY_ID.get(id as ThemeId)?.label ?? id;
}

export function isThemeId(value: string): value is ThemeId {
  return THEME_BY_ID.has(value as ThemeId);
}
