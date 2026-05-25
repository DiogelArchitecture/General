import type { ThemeId } from "./themes";

export interface Profile {
  id: string;
  display_name: string;
  created_at: string;
}

export interface Couple {
  id: string;
  invite_code: string;
  created_at: string;
}

export interface Entry {
  id: string;
  couple_id: string;
  author_id: string;
  subject_id: string;
  log_date: string;
  irritation_text: string;
  happy_text: string;
  irritation_theme: ThemeId | null;
  happy_theme: ThemeId | null;
  created_at: string;
}

export type TaskStatus = "assigned" | "completed";

// What the DOER is allowed to see: the positive action only. The chosen theme
// and rationale live in task_internals (no RLS policy) and never reach a
// browser — so the doer can't infer the task is linked to a complaint.
export interface Mission {
  id: string;
  title: string;
  instruction: string;
  status: TaskStatus;
}

// What the GUESSER sees, only after they've guessed (served by /api/guess).
export interface Reveal {
  title: string;
  instruction: string;
  theme: ThemeId;
  guessed_theme: ThemeId;
  is_correct: boolean;
}

export interface Guess {
  id: string;
  task_id: string;
  guesser_id: string;
  guessed_theme: ThemeId;
  guess_text: string;
  is_correct: boolean;
  created_at: string;
}
