import { customAlphabet } from "nanoid";
import {
  CLUE_COUNT_MAX,
  CLUE_COUNT_MIN,
  CLUE_WORD_MAX_LEN,
  DEFAULT_SETTINGS,
  SETTINGS_BOUNDS,
  type Clue,
  type Phase,
  type PublicState,
  type RoomSettings,
} from "../shared/types.ts";
import { drawPool } from "./words.ts";

// Avoid characters that can be confused with each other (0/O, 1/I/L).
const makeRoomCode = customAlphabet("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 5);
const makeId = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  10,
);
const makeToken = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  32,
);

export interface Player {
  id: string;
  name: string;
  sessionToken: string;
  socketId: string | null;
  isHost: boolean;
  score: number;
  bankSeconds: number;
}

export interface Round {
  number: number;
  pool: string[];
  startedAt: number;
  clues: Map<string, Clue>; // playerId -> Clue
  guesses: Map<string, Map<string, string[]>>; // guesserId -> targetId -> picks
  guessStartedAt: Map<string, Map<string, number>>; // guesserId -> targetId -> ts
}

export interface Room {
  code: string;
  settings: RoomSettings;
  hostId: string;
  players: Player[];
  phase: Phase;
  round: Round | null;
  createdAt: number;
}

const rooms = new Map<string, Room>();

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function getRoomBySocketId(
  socketId: string,
): { room: Room; player: Player } | undefined {
  for (const room of rooms.values()) {
    const player = room.players.find((p) => p.socketId === socketId);
    if (player) return { room, player };
  }
  return undefined;
}

export function clampSettings(input: Partial<RoomSettings>): RoomSettings {
  const merged: RoomSettings = { ...DEFAULT_SETTINGS, ...input };
  if (merged.language !== "en" && merged.language !== "fr") {
    merged.language = DEFAULT_SETTINGS.language;
  }
  for (const [key, bounds] of Object.entries(SETTINGS_BOUNDS) as [
    keyof typeof SETTINGS_BOUNDS,
    { min: number; max: number },
  ][]) {
    const v = merged[key];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      merged[key] = DEFAULT_SETTINGS[key] as never;
      continue;
    }
    merged[key] = Math.max(bounds.min, Math.min(bounds.max, Math.round(v))) as never;
  }
  if (merged.maxBankSeconds < merged.initialBankSeconds) {
    merged.maxBankSeconds = merged.initialBankSeconds;
  }
  return merged;
}

function makePlayer(name: string, isHost: boolean, bankSeconds: number): Player {
  return {
    id: makeId(),
    name: cleanName(name),
    sessionToken: makeToken(),
    socketId: null,
    isHost,
    score: 0,
    bankSeconds,
  };
}

export function cleanName(name: string): string {
  return name.trim().slice(0, 20) || "Player";
}

export function createRoom(
  hostName: string,
  settingsInput: Partial<RoomSettings> | undefined,
): { room: Room; player: Player } {
  const settings = clampSettings(settingsInput ?? {});
  let code = makeRoomCode();
  while (rooms.has(code)) code = makeRoomCode();
  const host = makePlayer(hostName, true, settings.initialBankSeconds);
  const room: Room = {
    code,
    settings,
    hostId: host.id,
    players: [host],
    phase: "lobby",
    round: null,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return { room, player: host };
}

export function joinRoom(
  code: string,
  name: string | undefined,
  sessionToken: string | undefined,
  socketId: string,
): { room: Room; player: Player } {
  const room = getRoom(code);
  if (!room) throw new Error("Room not found");

  if (sessionToken) {
    const existing = room.players.find((p) => p.sessionToken === sessionToken);
    if (existing) {
      existing.socketId = socketId;
      return { room, player: existing };
    }
  }

  if (room.phase !== "lobby") {
    throw new Error("Game already started");
  }
  if (!name || !name.trim()) {
    throw new Error("Name required");
  }
  const player = makePlayer(name, false, room.settings.initialBankSeconds);
  player.socketId = socketId;
  room.players.push(player);
  return { room, player };
}

export function setSettings(
  room: Room,
  player: Player,
  patch: Partial<RoomSettings>,
): void {
  if (!player.isHost) throw new Error("Only the host can change settings");
  if (room.phase !== "lobby") throw new Error("Settings locked: game in progress");
  const merged = clampSettings({ ...room.settings, ...patch });
  room.settings = merged;
  for (const p of room.players) {
    p.bankSeconds = merged.initialBankSeconds;
  }
}

export function startGame(room: Room, player: Player): void {
  if (!player.isHost) throw new Error("Only the host can start the game");
  if (room.phase !== "lobby") throw new Error("Game already started");
  if (room.players.length < 2) throw new Error("Need at least 2 players to start");
  room.phase = "round";
  room.round = newRound(room, 1);
}

function newRound(room: Room, number: number): Round {
  return {
    number,
    pool: drawPool(room.settings.language, room.settings.poolSize),
    startedAt: Date.now(),
    clues: new Map(),
    guesses: new Map(),
    guessStartedAt: new Map(),
  };
}

export function submitClue(
  room: Room,
  player: Player,
  word: string,
  count: number,
): void {
  if (room.phase !== "round" || !room.round) {
    throw new Error("Not in a round");
  }
  if (room.round.clues.has(player.id)) {
    throw new Error("Already submitted");
  }
  const cleaned = word.trim();
  if (!cleaned) throw new Error("Clue can't be empty");
  if (cleaned.length > CLUE_WORD_MAX_LEN) {
    throw new Error(`Clue too long (max ${CLUE_WORD_MAX_LEN} chars)`);
  }
  if (
    !Number.isInteger(count) ||
    count < CLUE_COUNT_MIN ||
    count > CLUE_COUNT_MAX
  ) {
    throw new Error(`Number must be between ${CLUE_COUNT_MIN} and ${CLUE_COUNT_MAX}`);
  }
  const submittedAt = Date.now();
  const clue: Clue = { word: cleaned, count, submittedAt };
  room.round.clues.set(player.id, clue);
  // Open the per-opponent guess windows that are now visible (both clues exist).
  recordGuessWindowsForPlayer(room, player.id, submittedAt);
}

function recordGuessWindowsForPlayer(
  room: Room,
  playerId: string,
  now: number,
): void {
  if (!room.round) return;
  for (const [otherId] of room.round.clues) {
    if (otherId === playerId) continue;
    openGuessWindow(room, playerId, otherId, now); // I just submitted; open my windows for everyone who already submitted
    openGuessWindow(room, otherId, playerId, now); // they had submitted; my new clue opens their window for me
  }
}

function openGuessWindow(
  room: Room,
  guesserId: string,
  targetId: string,
  ts: number,
): void {
  if (!room.round) return;
  let inner = room.round.guessStartedAt.get(guesserId);
  if (!inner) {
    inner = new Map();
    room.round.guessStartedAt.set(guesserId, inner);
  }
  if (!inner.has(targetId)) inner.set(targetId, ts);
}

export function attachSocket(room: Room, player: Player, socketId: string): void {
  player.socketId = socketId;
}

export function detachSocket(socketId: string): Room | undefined {
  for (const room of rooms.values()) {
    const player = room.players.find((p) => p.socketId === socketId);
    if (player) {
      player.socketId = null;
      return room;
    }
  }
  return undefined;
}

export function viewFor(room: Room, playerId: string): PublicState {
  const me = room.players.find((p) => p.id === playerId);
  const round = room.round;
  let publicRound = null;
  let publicMe = {
    clue: null as Clue | null,
    guesses: {} as { [k: string]: string[] },
    bankSeconds: me?.bankSeconds ?? 0,
  };
  if (round) {
    const myClue = round.clues.get(playerId) ?? null;
    const opponentClues: { [k: string]: Clue } = {};
    if (myClue) {
      for (const [pid, clue] of round.clues) {
        if (pid !== playerId) opponentClues[pid] = clue;
      }
    }
    publicRound = {
      number: round.number,
      pool: round.pool,
      startedAt: round.startedAt,
      hasClue: Array.from(round.clues.keys()),
      opponentClues,
    };
    const myGuesses: { [k: string]: string[] } = {};
    const guessesByMe = round.guesses.get(playerId);
    if (guessesByMe) {
      for (const [targetId, picks] of guessesByMe) {
        myGuesses[targetId] = picks;
      }
    }
    publicMe = {
      clue: myClue,
      guesses: myGuesses,
      bankSeconds: me?.bankSeconds ?? 0,
    };
  }

  return {
    phase: room.phase,
    roomCode: room.code,
    settings: room.settings,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.socketId !== null,
      isHost: p.isHost,
      score: p.score,
    })),
    myPlayerId: playerId,
    isHost: me?.isHost ?? false,
    me: publicMe,
    round: publicRound,
  };
}
