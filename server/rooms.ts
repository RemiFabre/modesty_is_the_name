import { customAlphabet } from "nanoid";
import {
  CLUE_COUNT_MAX,
  CLUE_COUNT_MIN,
  CLUE_WORD_MAX_LEN,
  DEFAULT_SETTINGS,
  SETTINGS_BOUNDS,
  type FullClue,
  type Phase,
  type PublicClue,
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
  /** Snapshot bank value at the last "close". Live value while running = bankSeconds - (now - bankActiveSince)/1000. */
  bankSeconds: number;
  /** When non-null, the bank is running (counting down) since this timestamp. */
  bankActiveSince: number | null;
  lastRoundDelta: number;
}

export interface Round {
  number: number;
  pool: string[];
  startedAt: number;
  clues: Map<string, FullClue>; // playerId -> Clue (with intended)
  guesses: Map<string, Map<string, string[]>>; // guesserId -> targetId -> picks
  guessStartedAt: Map<string, Map<string, number>>; // guesserId -> targetId -> ts
  /** Anonymous labels assigned to each player for this round. */
  labels: Map<string, string>;
}

const ANIMAL_LABELS = [
  "Fox",
  "Wolf",
  "Owl",
  "Bear",
  "Hawk",
  "Stag",
  "Lynx",
  "Otter",
  "Heron",
  "Raven",
  "Boar",
  "Hare",
];

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function assignLabels(players: Player[]): Map<string, string> {
  const shuffled = shuffle(ANIMAL_LABELS);
  const labels = new Map<string, string>();
  players.forEach((p, i) => {
    labels.set(p.id, shuffled[i % shuffled.length]);
  });
  return labels;
}

export interface Room {
  code: string;
  settings: RoomSettings;
  hostId: string;
  players: Player[];
  phase: Phase;
  round: Round | null;
  winnerId: string | null;
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
    bankActiveSince: null,
    lastRoundDelta: 0,
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
    winnerId: null,
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
    p.bankActiveSince = null;
  }
}

/* Bank helpers (single chess-clock model with per-action top-ups). */

function closeBank(player: Player, now: number): void {
  if (player.bankActiveSince !== null) {
    const elapsed = (now - player.bankActiveSince) / 1000;
    player.bankSeconds -= elapsed;
    player.bankActiveSince = null;
  }
}

function closeAllBanks(room: Room, now: number): void {
  for (const p of room.players) closeBank(p, now);
}

function isPlayerActiveInRound(room: Room, player: Player): boolean {
  if (room.phase !== "round" || !room.round) return false;
  const round = room.round;
  if (!round.clues.has(player.id)) return true;
  const guesses = round.guesses.get(player.id) ?? new Map();
  for (const [oppId] of round.clues) {
    if (oppId === player.id) continue;
    if (!guesses.has(oppId)) return true;
  }
  return false;
}

function syncBankActivity(room: Room, player: Player, now: number): void {
  const shouldBeActive = isPlayerActiveInRound(room, player);
  if (shouldBeActive && player.bankActiveSince === null) {
    player.bankActiveSince = now;
  } else if (!shouldBeActive) {
    closeBank(player, now);
  }
}

function syncAllBankActivity(room: Room, now: number): void {
  for (const p of room.players) syncBankActivity(room, p, now);
}

function applyBankTopUp(
  player: Player,
  amount: number,
  maxSeconds: number,
): void {
  player.bankSeconds = Math.min(player.bankSeconds + amount, maxSeconds);
}

export function startGame(room: Room, player: Player): void {
  if (!player.isHost) throw new Error("Only the host can start the game");
  if (room.phase !== "lobby") throw new Error("Game already started");
  if (room.players.length < 2) throw new Error("Need at least 2 players to start");
  room.phase = "round";
  room.round = newRound(room, 1);
  syncAllBankActivity(room, Date.now());
}

function newRound(room: Room, number: number): Round {
  return {
    number,
    pool: drawPool(room.settings.language, room.settings.poolSize),
    startedAt: Date.now(),
    clues: new Map(),
    guesses: new Map(),
    guessStartedAt: new Map(),
    labels: assignLabels(room.players),
  };
}

export function submitClue(
  room: Room,
  player: Player,
  word: string,
  intendedRaw: string[],
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
  const intended = validatePicks(room.round.pool, intendedRaw);
  if (intended.length < CLUE_COUNT_MIN || intended.length > CLUE_COUNT_MAX) {
    throw new Error(`Pick between ${CLUE_COUNT_MIN} and ${CLUE_COUNT_MAX} words`);
  }
  const submittedAt = Date.now();
  const clue: FullClue = {
    word: cleaned,
    count: intended.length,
    intended,
    submittedAt,
  };
  closeAllBanks(room, submittedAt);
  room.round.clues.set(player.id, clue);
  recordGuessWindowsForPlayer(room, player.id, submittedAt);
  applyBankTopUp(
    player,
    room.settings.cluePhaseSeconds,
    room.settings.maxBankSeconds,
  );
  syncAllBankActivity(room, submittedAt);
}

export function submitGuess(
  room: Room,
  player: Player,
  targetId: string,
  picksRaw: string[],
): void {
  if (room.phase !== "round" || !room.round) {
    throw new Error("Not in a round");
  }
  const round = room.round;
  if (!round.clues.has(player.id)) {
    throw new Error("Submit your own clue first");
  }
  if (targetId === player.id) {
    throw new Error("Can't guess for yourself");
  }
  const targetClue = round.clues.get(targetId);
  if (!targetClue) {
    throw new Error("Target hasn't submitted a clue");
  }
  let outer = round.guesses.get(player.id);
  if (!outer) {
    outer = new Map();
    round.guesses.set(player.id, outer);
  }
  if (outer.has(targetId)) {
    throw new Error("Already guessed for this opponent");
  }
  const picks = validatePicks(round.pool, picksRaw);
  if (picks.length !== targetClue.count) {
    throw new Error(`Pick exactly ${targetClue.count} words`);
  }
  const now = Date.now();
  closeAllBanks(room, now);
  outer.set(targetId, picks);
  applyBankTopUp(
    player,
    room.settings.guessPhaseSeconds,
    room.settings.maxBankSeconds,
  );
  syncAllBankActivity(room, now);
  tryResolveRound(room);
}

function validatePicks(pool: string[], raw: string[]): string[] {
  if (!Array.isArray(raw)) throw new Error("Bad picks");
  const seen = new Set<string>();
  const result: string[] = [];
  for (const w of raw) {
    if (typeof w !== "string") throw new Error("Bad pick");
    if (seen.has(w)) throw new Error("Duplicate pick");
    if (!pool.includes(w)) throw new Error(`"${w}" not in pool`);
    seen.add(w);
    result.push(w);
  }
  return result;
}

function recordGuessWindowsForPlayer(
  room: Room,
  playerId: string,
  now: number,
): void {
  if (!room.round) return;
  for (const [otherId] of room.round.clues) {
    if (otherId === playerId) continue;
    openGuessWindow(room, playerId, otherId, now);
    openGuessWindow(room, otherId, playerId, now);
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

function tryResolveRound(room: Room): void {
  if (!room.round) return;
  const round = room.round;
  // Determine clue-submitters; each must guess for each other.
  const submitters = Array.from(round.clues.keys());
  if (submitters.length < 2) return;
  for (const guesserId of submitters) {
    const inner = round.guesses.get(guesserId) ?? new Map();
    for (const targetId of submitters) {
      if (targetId === guesserId) continue;
      if (!inner.has(targetId)) return; // missing guess; not yet
    }
  }
  // All guesses in. Compute scores.
  for (const p of room.players) p.lastRoundDelta = 0;
  for (const guesserId of submitters) {
    const inner = round.guesses.get(guesserId)!;
    for (const targetId of submitters) {
      if (targetId === guesserId) continue;
      const picks = inner.get(targetId) ?? [];
      const intended = round.clues.get(targetId)!.intended;
      const intendedSet = new Set(intended);
      let hits = 0;
      for (const w of picks) if (intendedSet.has(w)) hits++;
      const misses = picks.length - hits;
      const delta = hits - misses;
      const guesser = room.players.find((p) => p.id === guesserId)!;
      const target = room.players.find((p) => p.id === targetId)!;
      guesser.score += delta;
      guesser.lastRoundDelta += delta;
      target.score += delta;
      target.lastRoundDelta += delta;
    }
  }
  // First-to-N detection.
  const target = room.settings.pointsPerPlayer * room.players.length;
  const reachers = room.players.filter((p) => p.score >= target);
  if (reachers.length > 0) {
    // Highest score wins; ties broken by... order in array (good enough for v1).
    let winner = reachers[0];
    for (const p of reachers) {
      if (p.score > winner.score) winner = p;
    }
    room.phase = "ended";
    room.winnerId = winner.id;
  } else {
    room.phase = "reveal";
  }
  // Round is over — pause everyone's bank.
  closeAllBanks(room, Date.now());
}

export function nextRound(room: Room, player: Player): void {
  if (!player.isHost) throw new Error("Only the host can advance the round");
  if (room.phase !== "reveal") throw new Error("Round isn't over");
  const next = (room.round?.number ?? 0) + 1;
  room.phase = "round";
  room.round = newRound(room, next);
  for (const p of room.players) p.lastRoundDelta = 0;
  syncAllBankActivity(room, Date.now());
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
  const isReveal = room.phase === "reveal" || room.phase === "ended";
  const showOthersScores = room.phase === "ended";

  let publicRound = null;
  let publicMe = {
    clue: null as FullClue | null,
    guesses: {} as { [k: string]: string[] },
    bankSeconds: me?.bankSeconds ?? 0,
    bankActiveSince: me?.bankActiveSince ?? null,
  };

  if (round) {
    const myClue = round.clues.get(playerId) ?? null;
    const cluesPublic: { [k: string]: PublicClue } = {};
    for (const [pid, clue] of round.clues) {
      if (pid === playerId) continue;
      const reveal = isReveal;
      const visibleByClueSubmit = myClue !== null;
      if (reveal || visibleByClueSubmit) {
        cluesPublic[pid] = {
          word: clue.word,
          count: clue.count,
          submittedAt: clue.submittedAt,
          intended: reveal ? clue.intended : undefined,
        };
      }
    }

    const guessesPublic: { [g: string]: { [t: string]: string[] } } = {};
    if (isReveal) {
      for (const [g, inner] of round.guesses) {
        guessesPublic[g] = {};
        for (const [t, picks] of inner) {
          guessesPublic[g][t] = picks;
        }
      }
    } else {
      // Only show me my own guesses during the round.
      const mine = round.guesses.get(playerId);
      if (mine) {
        guessesPublic[playerId] = {};
        for (const [t, picks] of mine) {
          guessesPublic[playerId][t] = picks;
        }
      }
    }

    publicRound = {
      number: round.number,
      pool: round.pool,
      startedAt: round.startedAt,
      hasClue: Array.from(round.clues.keys()),
      opponentClues: cluesPublic,
      allGuesses: guessesPublic,
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
      bankActiveSince: me?.bankActiveSince ?? null,
    };
  } else {
    publicMe = {
      clue: null,
      guesses: {},
      bankSeconds: me?.bankSeconds ?? 0,
      bankActiveSince: me?.bankActiveSince ?? null,
    };
  }

  const isAnonRound = room.phase === "round" && room.round !== null;
  const labels = room.round?.labels;

  return {
    phase: room.phase,
    roomCode: room.code,
    settings: room.settings,
    players: room.players.map((p) => {
      const isMe = p.id === playerId;
      const displayName =
        isAnonRound && !isMe ? labels?.get(p.id) ?? p.name : p.name;
      return {
        id: p.id,
        name: displayName,
        realName: showOthersScores || isMe ? p.name : undefined,
        connected: p.socketId !== null,
        isHost: p.isHost,
        score: p.score,
        lastRoundDelta: p.lastRoundDelta,
        hideScore: false,
        anonymous: isAnonRound && !isMe,
      };
    }),
    myPlayerId: playerId,
    isHost: me?.isHost ?? false,
    me: publicMe,
    round: publicRound,
    winnerId: room.winnerId,
  };
}
