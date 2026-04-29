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

export type ScoringMode = "symmetric" | "generous" | "precision";

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
  /** Grid rows. Pool is displayed and addressed as a stable poolRows × poolCols grid;
   *  the pool array is row-major and a cell's identity is its index, not the word
   *  that occupies it. Words slot in/out across rounds; cells stay put. */
  poolRows: number;
  poolCols: number;
  cluePhaseSeconds: number;
  guessPhaseSeconds: number;
  initialBankSeconds: number;
  maxBankSeconds: number;
  pointsPerPlayer: number;
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
  poolRows: 4,
  poolCols: 5,
  cluePhaseSeconds: 120,
  guessPhaseSeconds: 60,
  initialBankSeconds: 180,
  maxBankSeconds: 240,
  pointsPerPlayer: 18,
  polyglotBonus: false,
  originalityBonus: false,
};

export const SETTINGS_BOUNDS = {
  poolRows: { min: 3, max: 8 },
  poolCols: { min: 3, max: 8 },
  cluePhaseSeconds: { min: 5, max: 600 },
  guessPhaseSeconds: { min: 5, max: 300 },
  initialBankSeconds: { min: 5, max: 1800 },
  maxBankSeconds: { min: 5, max: 1800 },
  pointsPerPlayer: { min: 1, max: 50 },
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
  /** Server-computed: what action this player owes next. Saves agents the bookkeeping. */
  owedAction: OwedAction;
  /** When `owedAction === "submit_guess"`, the opponent to guess for next (in submission order). */
  nextTarget: PendingGuess | null;
  /** Snapshot bank value at the last "close" event. */
  bankSeconds: number;
  /** When non-null, the bank is running (counting down) since this timestamp (server clock). */
  bankActiveSince: number | null;
}

/** Per-player history shown in the clue-history panel. */
export interface PublicClueHistory {
  playerId: string;
  /** Real name of the player. */
  name: string;
  /** All clue words this player has used so far in the game, in submission order. */
  clueHistory: string[];
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
  /** Per-player clue-history snapshot. Always present once a round exists. */
  clueHistories: PublicClueHistory[];
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
    payload: { targetId: string; picks: string[] },
    cb: (ack: Ack<{ ok: true }>) => void,
  ) => void;
  "round:next": (cb: (ack: Ack<{ ok: true }>) => void) => void;
}

export interface ServerToClientEvents {
  state: (state: PublicState) => void;
  error: (msg: string) => void;
}
