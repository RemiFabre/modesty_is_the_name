export type Language =
  | "en"
  | "fr"
  | "es"
  | "pt"
  | "de"
  | "it"
  | "pl"
  | "nl"
  | "tr"
  | "cs";

export const LANGUAGES: Language[] = [
  "en",
  "fr",
  "es",
  "pt",
  "de",
  "it",
  "pl",
  "nl",
  "tr",
  "cs",
];

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  pt: "Português",
  de: "Deutsch",
  it: "Italiano",
  pl: "Polski",
  nl: "Nederlands",
  tr: "Türkçe",
  cs: "Čeština",
};

export interface AxisPair {
  /** End-label shown for value 1. */
  left: string;
  /** End-label shown for value 5. */
  right: string;
}

export const PROFILE_AXIS_MIN = 1;
export const PROFILE_AXIS_MAX = 5;
export const PROFILE_AXIS_VALUES = [1, 2, 3, 4, 5];
export const PROFILE_AXES_MIN = 3;
export const PROFILE_AXES_MAX = 8;
export const AXIS_LABEL_MAX_LEN = 16;

export interface ProfilePreset {
  id: string;
  label: string;
  axes: AxisPair[];
}

/**
 * Curated presets, each is 4 binary-friendly axes, vetted via playtests.
 * The earlier 10 presets were narrowed to 4 to converge on quality.
 * See agent reviews from games 1–2 for the rationale (axes that flatten to
 * "neutral" too easily, Abstract/Concrete, Old/New, were dropped).
 */
export const PROFILE_PRESETS: ProfilePreset[] = [
  {
    id: "storyteller",
    label: "Storyteller",
    axes: [
      { left: "Hero", right: "Villain" },
      { left: "Order", right: "Chaos" },
      { left: "Mind", right: "Body" },
      { left: "Fate", right: "Free will" },
    ],
  },
  {
    id: "texture",
    label: "Texture",
    axes: [
      { left: "Light", right: "Heavy" },
      { left: "Soft", right: "Sharp" },
      { left: "Bright", right: "Dark" },
      { left: "Quiet", right: "Loud" },
    ],
  },
  {
    id: "temperament",
    label: "Temperament",
    axes: [
      { left: "Brave", right: "Cautious" },
      { left: "Wild", right: "Civilized" },
      { left: "Solitary", right: "Social" },
      { left: "Playful", right: "Serious" },
    ],
  },
  {
    id: "forces",
    label: "Forces",
    axes: [
      { left: "Fast", right: "Slow" },
      { left: "Natural", right: "Artificial" },
      { left: "Calm", right: "Chaotic" },
      { left: "Strong", right: "Fragile" },
    ],
  },
];

export const DEFAULT_PROFILE_AXES: AxisPair[] =
  PROFILE_PRESETS.find((p) => p.id === "storyteller")!.axes;

export type ScoringMode = "symmetric" | "generous" | "precision";

/**
 * Profile axis value mode.
 * - "gradient": each axis takes a 1..5 integer (5 levels, classic).
 * - "binary":  each axis takes ONLY the two extremes (1 = left, 5 = right).
 *   Designed to fix the "regression-to-mean" problem where extreme profiles
 *   get smoothed toward 3 by cautious default-3 guesses.
 */
export type ProfileMode = "gradient" | "binary";

export const PROFILE_BINARY_LOW = 1;
export const PROFILE_BINARY_HIGH = 5;

export const SCORING_MODES: ScoringMode[] = ["symmetric", "generous", "precision"];

export interface ScoringModeInfo {
  id: ScoringMode;
  label: string;
  short: string;
  description: string;
}

export const SCORING_MODE_INFO: Record<ScoringMode, ScoringModeInfo> = {
  symmetric: {
    id: "symmetric",
    label: "Symmetric",
    short: "+1 / −1",
    description:
      "Each correct word is +1 to both you and the clue-giver. Each incorrect word is −1 to both. Default.",
  },
  generous: {
    id: "generous",
    label: "Generous",
    short: "+2 / −1",
    description:
      "Each correct word is +2 to both. Each incorrect word is −1 to both. Rewards confident clues; doesn't punish risk-taking too hard.",
  },
  precision: {
    id: "precision",
    label: "Precision",
    short: "all-or-nothing, T(n) reward",
    description:
      "Triangular reward on perfect hits, ZERO on anything less. If you find ALL N intended words, both sides get T(N) = 1, 3, 6, 10, 15, 21, 28, 36, 45 for N=1..9. Otherwise nothing. No negatives. Encourages precision; rewards big clean clues.",
  },
};

/** Triangular numbers: T(n) = n(n+1)/2 → 0, 1, 3, 6, 10, 15, 21, 28, 36, 45.
 *  Used by precision-mode scoring and the polyglot-cluster bonus. */
export function triangular(n: number): number {
  if (n <= 0) return 0;
  return (n * (n + 1)) / 2;
}

export interface RoomSettings {
  /** One or more languages to draw the public pool from. The pool samples
   *  roughly equally from each. Players may clue in any of them. */
  languages: Language[];
  scoring: ScoringMode;
  poolSize: number;
  cluePhaseSeconds: number;
  guessPhaseSeconds: number;
  initialBankSeconds: number;
  maxBankSeconds: number;
  pointsPerPlayer: number;
  /** The axis pairs for the profile-guessing meta-layer. 3..8 entries. */
  profileAxes: AxisPair[];
  /** Whether axis values are gradient 1..5 or binary {1, 5}. */
  profileMode: ProfileMode;
  /**
   * If true (default), the cumulative profile-guess averages ("public figure")
   * are tracked, displayed in the Nations panel, and the end-of-game accuracy
   * bonus is applied. If false, none of that, just per-axis +1 each round.
   */
  publicFigures: boolean;
  /** End-of-game bonus per matching axis. Only used when publicFigures is true. */
  publicAccuracyBonus: number;
  /**
   * Polyglot cluster bonus: if all intended words are guessed correctly AND
   * languages.length > 1, group the words by language and award a triangular
   * bonus per "horizontal slice" (each slice = one cluster of distinct-language
   * words). Symmetric (both guesser and clue-giver). See RULES.md.
   */
  polyglotBonus: boolean;
  /**
   * Originality bonus: each correctly-guessed word w contributes a uniqueness
   * weight U(w) = 1 - (c(w) - 1) / max(N - 1, 1) instead of 1, where c(w) is
   * the number of cluers (this round) whose intended set contains w and N is
   * the number of cluers. U=1 = only the target picked it; U=0 = everyone did.
   * Applies symmetrically to both guesser and target. Discourages convergence
   * on obvious clusters.
   */
  originalityBonus: boolean;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  languages: ["en"],
  scoring: "symmetric",
  poolSize: 20,
  cluePhaseSeconds: 120,
  guessPhaseSeconds: 60,
  initialBankSeconds: 180,
  maxBankSeconds: 240,
  pointsPerPlayer: 18,
  profileAxes: DEFAULT_PROFILE_AXES,
  profileMode: "binary",
  publicFigures: true,
  publicAccuracyBonus: 2,
  polyglotBonus: false,
  originalityBonus: false,
};

export const SETTINGS_BOUNDS = {
  poolSize: { min: 9, max: 40 },
  cluePhaseSeconds: { min: 5, max: 600 },
  guessPhaseSeconds: { min: 5, max: 300 },
  initialBankSeconds: { min: 5, max: 1800 },
  maxBankSeconds: { min: 5, max: 1800 },
  pointsPerPlayer: { min: 1, max: 50 },
  publicAccuracyBonus: { min: 0, max: 10 },
};

export const CLUE_COUNT_MIN = 1;
export const CLUE_COUNT_MAX = 9;
export const CLUE_WORD_MAX_LEN = 30;

export type Phase = "lobby" | "round" | "reveal" | "ended";

export interface ScoreBreakdown {
  /** Points from MY guesses of others' words (correct-pick contribution). */
  wordGuesser: number;
  /** Points from others guessing MY clue words correctly. */
  wordTarget: number;
  /** Points from MY axis guesses of others' profiles. */
  profileGuesser: number;
  /** Points from others correctly guessing MY profile axes. */
  profileTarget: number;
  /** Public-accuracy bonus (awarded once at game end). */
  accuracyBonus: number;
}

export interface PublicPlayer {
  id: string;
  /** During round phase, this is the anonymous label for opponents. Reveal/ended/lobby show real names. */
  name: string;
  /** The player's real (chosen) name. Always exposed, anonymity is enforced via `name`/`anonymous` only for in-round per-clue UI. */
  realName: string;
  connected: boolean;
  isHost: boolean;
  score: number;
  lastRoundDelta: number;
  /** True when this is another player and the current viewer should not see their score. */
  hideScore: boolean;
  /** True if this player is being shown anonymously (opponent during round phase). */
  anonymous: boolean;
  /** Score broken down by source. */
  breakdown: ScoreBreakdown;
}

export interface PublicClue {
  word: string;
  count: number;
  submittedAt: number;
  /** The clue-giver's secret intended set. Only revealed during reveal/ended phases. */
  intended?: string[];
}

export interface Clue {
  word: string;
  count: number;
  submittedAt: number;
}

export interface FullClue extends Clue {
  intended: string[];
}

export type OwedAction =
  /** Lobby phase, you're host: call `start` when expected players are in. */
  | "host_start"
  /** Lobby phase, you're not host: just wait. */
  | "wait_for_start"
  /** Round phase, you haven't submitted a clue. */
  | "submit_clue"
  /** Round phase, there's an opponent you owe a guess for. See `me.nextTarget`. */
  | "submit_guess"
  /** Round phase, you've done your part, wait for the rest of the table. */
  | "wait_for_others"
  /** Reveal phase, you're host: call `next` to advance. */
  | "host_advance"
  /** Reveal phase, you're not host: wait for advance. */
  | "wait_for_advance"
  /** Game has ended, write your review and exit. */
  | "review"
  /** Anything else (rare). */
  | "idle";

export interface PendingGuess {
  /** The opponent's player ID. Pass this to `bot-cli guess --target <id>`. */
  playerId: string;
  /** Real name (during round phase: anonymous label). */
  name: string;
  clueWord: string;
  clueCount: number;
}

export interface PublicMe {
  clue: FullClue | null;
  guesses: { [targetId: string]: string[] };
  /** My profile guesses this round, keyed by target playerId. */
  profileGuesses: { [targetId: string]: number[] };
  /** My own profile (always visible to me). */
  profile: number[];
  /** Server-computed: what action this player owes next. Saves agents the bookkeeping. */
  owedAction: OwedAction;
  /** When `owedAction === "submit_guess"`, the opponent to guess for next (in submission order). */
  nextTarget: PendingGuess | null;
  /** Snapshot bank value at the last "close" event. */
  bankSeconds: number;
  /** When non-null, the bank is running (counting down) since this timestamp (server clock). */
  bankActiveSince: number | null;
}

export interface PublicNation {
  playerId: string;
  /** Real name of the player whose nation this is. */
  name: string;
  /** All clue words this player has used so far in the game, in submission order. */
  clueHistory: string[];
  /** Current public read on each axis: average across all opponents' most-recent guesses. null if no one has guessed yet. */
  averageAxes: (number | null)[];
  /** How many opponents contributed to the current averageAxes. */
  guessSamples: number;
  /** True if the round just resolved and we should show this player's solve count etc. */
}

export interface ProfileFeedback {
  /** Per-target, per-axis correctness from the round that just resolved. */
  hits: { [targetId: string]: boolean[] };
}

/** End-of-game accuracy summary for one player. */
export interface ProfileAccuracy {
  playerId: string;
  /** Per-axis: was the rounded public figure equal to the true value? */
  matches: boolean[];
  /** The cumulative public figure (raw float) per axis. null = no guesses ever submitted for that target. */
  rawPublic: (number | null)[];
  /** Same value, rounded to nearest 1..5 (used for the bonus comparison). */
  roundedPublic: (number | null)[];
  /** True profile values (revealed at game end). */
  truth: number[];
  /** Total bonus this player earned (matches.filter(x=>x).length * publicAccuracyBonus). */
  bonus: number;
}

export interface PublicRound {
  number: number;
  pool: string[];
  /** For each pool word, the canonical language it was drawn as. Useful for
   *  the polyglot cluster bonus and for displaying flags on the UI. */
  poolLangs: { [word: string]: Language };
  startedAt: number;
  /** Players who have submitted a clue this round. */
  hasClue: string[];
  /** Opponents' clues. Only visible to me once I've submitted mine. Includes intended[] only during reveal. */
  opponentClues: { [playerId: string]: PublicClue };
  /** During the round: only my own guesses. During reveal: everyone's guesses. */
  allGuesses: { [guesserId: string]: { [targetId: string]: string[] } };
  /** Server-computed: opponents I still owe a guess for, in submission order. Empty if I'm done. */
  pendingGuesses: PendingGuess[];
}

export interface PublicState {
  phase: Phase;
  roomCode: string;
  settings: RoomSettings;
  players: PublicPlayer[];
  myPlayerId: string;
  isHost: boolean;
  me: PublicMe;
  round: PublicRound | null;
  /** Set when phase === "ended". */
  winnerId: string | null;
  /** Per-player nation snapshot (clue history + average axes). Always present when phase !== lobby. */
  nations: PublicNation[];
  /** Reveal-only feedback for me on this round's profile guesses. */
  profileFeedback: ProfileFeedback | null;
  /** True profiles of every player. Only present at phase === "ended". */
  trueProfiles?: { [playerId: string]: number[] };
  /** End-of-game accuracy summary for every player. Only present at phase === "ended". */
  accuracy?: ProfileAccuracy[];
}

export interface JoinAck {
  ok: true;
  roomCode: string;
  playerId: string;
  sessionToken: string;
}

export interface CreateAck {
  ok: true;
  roomCode: string;
  playerId: string;
  sessionToken: string;
}

export interface ErrorAck {
  ok: false;
  error: string;
}

export type Ack<T> = T | ErrorAck;

export interface ClientToServerEvents {
  "room:create": (
    payload: { hostName: string; settings?: Partial<RoomSettings> },
    cb: (ack: Ack<CreateAck>) => void,
  ) => void;
  "room:join": (
    payload: { roomCode: string; name?: string; sessionToken?: string },
    cb: (ack: Ack<JoinAck>) => void,
  ) => void;
  "room:settings": (
    payload: { settings: Partial<RoomSettings> },
    cb: (ack: Ack<{ ok: true }>) => void,
  ) => void;
  "room:start": (cb: (ack: Ack<{ ok: true }>) => void) => void;
  "clue:submit": (
    payload: { word: string; intended: string[] },
    cb: (ack: Ack<{ ok: true }>) => void,
  ) => void;
  "guess:submit": (
    payload: { targetId: string; picks: string[]; axes: number[] },
    cb: (ack: Ack<{ ok: true }>) => void,
  ) => void;
  "round:next": (cb: (ack: Ack<{ ok: true }>) => void) => void;
}

export interface ServerToClientEvents {
  state: (state: PublicState) => void;
  error: (msg: string) => void;
}
