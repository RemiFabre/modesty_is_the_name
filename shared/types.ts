export type Language = "en" | "fr";

export type ScoringMode = "symmetric" | "forgiving" | "risky";

export const SCORING_MODES: ScoringMode[] = ["symmetric", "forgiving", "risky"];

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
  forgiving: {
    id: "forgiving",
    label: "Forgiving",
    short: "+1 / 0",
    description:
      "Each correct word is +1 to both. Wrong picks cost nothing. The lowest-friction mode.",
  },
  risky: {
    id: "risky",
    label: "Risky",
    short: "bonus on streaks",
    description:
      "Hits scale: 1, 2, 4, 6, 9, 12, 16, 20, 25 for 1..9 correct. Each miss is −1. Big clues are explosive — both ways.",
  },
};

/** Total reward for the bundle of `n` hits in risky mode. f(n) = floor((n+1)² / 4). */
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
};

export const SETTINGS_BOUNDS = {
  poolSize: { min: 9, max: 40 },
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

export interface PublicPlayer {
  id: string;
  /** During round phase, this is the anonymous label for opponents. Reveal/ended/lobby show real names. */
  name: string;
  /** Real name. Only present when the viewer is allowed to see it (self always; others only at reveal/ended). */
  realName?: string;
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
  /** Snapshot bank value at the last "close" event. */
  bankSeconds: number;
  /** When non-null, the bank is running (counting down) since this timestamp (server clock). */
  bankActiveSince: number | null;
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
