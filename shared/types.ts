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

export interface PublicPlayer {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
}

export type Phase = "lobby" | "clue" | "guess" | "reveal" | "ended";

export interface PublicLobbyState {
  phase: "lobby";
  roomCode: string;
  settings: RoomSettings;
  players: PublicPlayer[];
}
