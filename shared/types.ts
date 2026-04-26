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

export const PROFILE_PRESETS: ProfilePreset[] = [
  {
    id: "geopolitical",
    label: "Geopolitical",
    axes: [
      { left: "War", right: "Peace" },
      { left: "Freedom", right: "Control" },
      { left: "Tradition", right: "Progress" },
      { left: "Isolation", right: "Engagement" },
    ],
  },
  {
    id: "conceptual",
    label: "Conceptual",
    axes: [
      { left: "Light", right: "Heavy" },
      { left: "Abstract", right: "Concrete" },
      { left: "Fast", right: "Slow" },
      { left: "Old", right: "New" },
    ],
  },
  {
    id: "mood",
    label: "Mood",
    axes: [
      { left: "Joyful", right: "Sorrowful" },
      { left: "Calm", right: "Chaotic" },
      { left: "Warm", right: "Cold" },
    ],
  },
  {
    id: "aesthetic",
    label: "Aesthetic",
    axes: [
      { left: "Minimal", right: "Ornate" },
      { left: "Smooth", right: "Rough" },
      { left: "Bright", right: "Dark" },
      { left: "Soft", right: "Sharp" },
      { left: "Quiet", right: "Loud" },
    ],
  },
  {
    id: "personality",
    label: "Personality",
    axes: [
      { left: "Open", right: "Conventional" },
      { left: "Conscientious", right: "Carefree" },
      { left: "Extraverted", right: "Introverted" },
      { left: "Agreeable", right: "Competitive" },
      { left: "Stable", right: "Anxious" },
    ],
  },
  {
    id: "adventure",
    label: "Adventure",
    axes: [
      { left: "Brave", right: "Cautious" },
      { left: "Wild", right: "Civilized" },
      { left: "Solo", right: "Collective" },
    ],
  },
  {
    id: "civilization",
    label: "Civilization",
    axes: [
      { left: "Agricultural", right: "Industrial" },
      { left: "Land", right: "Sea" },
      { left: "Religious", right: "Secular" },
      { left: "Authoritarian", right: "Democratic" },
      { left: "Insular", right: "Cosmopolitan" },
      { left: "Martial", right: "Mercantile" },
    ],
  },
  {
    id: "elements",
    label: "Elements",
    axes: [
      { left: "Fire", right: "Water" },
      { left: "Earth", right: "Air" },
      { left: "Day", right: "Night" },
      { left: "Life", right: "Death" },
    ],
  },
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
    id: "style",
    label: "Style",
    axes: [
      { left: "Classic", right: "Modern" },
      { left: "Restrained", right: "Excessive" },
      { left: "Earnest", right: "Ironic" },
    ],
  },
];

export const DEFAULT_PROFILE_AXES: AxisPair[] =
  PROFILE_PRESETS.find((p) => p.id === "storyteller")!.axes;

export type ScoringMode = "symmetric" | "generous" | "risky";

export const SCORING_MODES: ScoringMode[] = ["symmetric", "generous", "risky"];

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
  risky: {
    id: "risky",
    label: "Risky",
    short: "non-linear both ways",
    description:
      "Sub-quadratic scaling on BOTH hits and misses. f(n)=⌊(n+1)²/4⌋ → 1,2,4,6,9,12,16,20,25. Delta = f(hits) − f(misses) (applied to both you and the clue-giver). Big clean wins are explosive; big clean misses are catastrophic.",
  },
};

/** Sub-quadratic reward function used in risky mode. f(n) = floor((n+1)² / 4). */
export function riskyReward(n: number): number {
  if (n <= 0) return 0;
  return Math.floor(((n + 1) * (n + 1)) / 4);
}

export interface RoomSettings {
  language: Language;
  scoring: ScoringMode;
  poolSize: number;
  cluePhaseSeconds: number;
  guessPhaseSeconds: number;
  initialBankSeconds: number;
  maxBankSeconds: number;
  pointsPerPlayer: number;
  /** The axis pairs for the profile-guessing meta-layer. 3..8 entries. */
  profileAxes: AxisPair[];
  /** Bonus awarded the first time a player correctly guesses ALL axes of an opponent. */
  solveBonus: number;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  language: "en",
  scoring: "symmetric",
  poolSize: 25,
  cluePhaseSeconds: 120,
  guessPhaseSeconds: 60,
  initialBankSeconds: 180,
  maxBankSeconds: 240,
  pointsPerPlayer: 10,
  profileAxes: DEFAULT_PROFILE_AXES,
  solveBonus: 5,
};

export const SETTINGS_BOUNDS = {
  poolSize: { min: 9, max: 40 },
  cluePhaseSeconds: { min: 5, max: 600 },
  guessPhaseSeconds: { min: 5, max: 300 },
  initialBankSeconds: { min: 5, max: 1800 },
  maxBankSeconds: { min: 5, max: 1800 },
  pointsPerPlayer: { min: 1, max: 50 },
  solveBonus: { min: 0, max: 30 },
};

export const CLUE_COUNT_MIN = 1;
export const CLUE_COUNT_MAX = 9;
export const CLUE_WORD_MAX_LEN = 30;

export type Phase = "lobby" | "round" | "reveal" | "ended";

export interface PublicPlayer {
  id: string;
  /** During round phase, this is the anonymous label for opponents. Reveal/ended/lobby show real names. */
  name: string;
  /** The player's real (chosen) name. Always exposed — anonymity is enforced via `name`/`anonymous` only for in-round per-clue UI. */
  realName: string;
  connected: boolean;
  isHost: boolean;
  score: number;
  lastRoundDelta: number;
  /** True when this is another player and the current viewer should not see their score. */
  hideScore: boolean;
  /** True if this player is being shown anonymously (opponent during round phase). */
  anonymous: boolean;
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

export interface PublicMe {
  clue: FullClue | null;
  guesses: { [targetId: string]: string[] };
  /** My profile guesses this round, keyed by target playerId. */
  profileGuesses: { [targetId: string]: number[] };
  /** My own profile (always visible to me). */
  profile: number[];
  /** Player IDs whose profiles I have already solved (cumulative across rounds). */
  solvedTargets: string[];
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
  /** Number of axes correctly guessed for each target last round (only filled in reveal/ended). */
  hits: { [targetId: string]: number };
  /** Targets whose profile this player has just SOLVED (became correct this round). */
  solvedThisRound: string[];
}

export interface PublicRound {
  number: number;
  pool: string[];
  startedAt: number;
  /** Players who have submitted a clue this round. */
  hasClue: string[];
  /** Opponents' clues. Only visible to me once I've submitted mine. Includes intended[] only during reveal. */
  opponentClues: { [playerId: string]: PublicClue };
  /** During the round: only my own guesses. During reveal: everyone's guesses. */
  allGuesses: { [guesserId: string]: { [targetId: string]: string[] } };
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
