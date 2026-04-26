export type Language = "en" | "fr";

export interface RoomSettings {
  language: Language;
  poolSize: number;
  cluePhaseSeconds: number;
  guessPhaseSeconds: number;
  initialBankSeconds: number;
  maxBankSeconds: number;
  pointsPerPlayer: number;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  language: "en",
  poolSize: 25,
  cluePhaseSeconds: 120,
  guessPhaseSeconds: 60,
  initialBankSeconds: 180,
  maxBankSeconds: 240,
  pointsPerPlayer: 10,
};

export const SETTINGS_BOUNDS = {
  poolSize: { min: 9, max: 40 },
  cluePhaseSeconds: { min: 30, max: 600 },
  guessPhaseSeconds: { min: 15, max: 300 },
  initialBankSeconds: { min: 30, max: 1800 },
  maxBankSeconds: { min: 30, max: 1800 },
  pointsPerPlayer: { min: 1, max: 50 },
};

export const CLUE_COUNT_MIN = 1;
export const CLUE_COUNT_MAX = 9;

export type Phase = "lobby" | "clue" | "guess" | "reveal" | "ended";

export interface PublicPlayer {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  score: number;
}

export interface PublicState {
  phase: Phase;
  roomCode: string;
  settings: RoomSettings;
  players: PublicPlayer[];
  myPlayerId: string;
  isHost: boolean;
  // Phase-specific extension fields will be added in future tasks.
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
}

export interface ServerToClientEvents {
  state: (state: PublicState) => void;
  error: (msg: string) => void;
}
