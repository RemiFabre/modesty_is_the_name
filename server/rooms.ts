import { customAlphabet } from "nanoid";
import {
  AXIS_LABEL_MAX_LEN,
  CLUE_COUNT_MAX,
  CLUE_COUNT_MIN,
  CLUE_WORD_MAX_LEN,
  DEFAULT_PROFILE_AXES,
  DEFAULT_SETTINGS,
  LANGUAGES,
  PROFILE_AXES_MAX,
  PROFILE_AXES_MIN,
  PROFILE_AXIS_MAX,
  PROFILE_AXIS_MIN,
  riskyReward,
  SCORING_MODES,
  SETTINGS_BOUNDS,
  type AxisPair,
  type FullClue,
  type Phase,
  type OwedAction,
  type PendingGuess,
  type ProfileAccuracy,
  type ProfileFeedback,
  type PublicClue,
  type PublicNation,
  type PublicState,
  type RoomSettings,
  type ScoringMode,
} from "../shared/types.ts";
import { persistGame, snapshotRound, type RoundLog } from "./persistence.ts";
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
  /** Hidden profile (1..5 per axis). Set at game start. */
  profile: number[];
  /** Clue words this player has used so far in the game, in submission order. */
  clueHistory: string[];
  /** Per-target per-axis correctness for THIS round (consumed at next round start). */
  hitsThisRound: Map<string, boolean[]>;
  /** Score breakdown — accumulates over the game. score = sum of these. */
  wordScoreAsGuesser: number;
  wordScoreAsTarget: number;
  profileScoreAsGuesser: number;
  profileScoreAsTarget: number;
  accuracyBonus: number;
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
  /** Profile guesses for this round. guesserId -> targetId -> axis values. */
  profileGuesses: Map<string, Map<string, number[]>>;
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
  /** Cumulative per-target axis sums across every guess ever submitted. */
  profileGuessSums: Map<string, number[]>;
  /** Total number of guesses ever submitted for each target. */
  profileGuessSamples: Map<string, number>;
  /** Snapshot of every resolved round, in order. Used for game-log persistence. */
  history: RoundLog[];
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
  if (!LANGUAGES.includes(merged.language)) {
    merged.language = DEFAULT_SETTINGS.language;
  }
  if (!SCORING_MODES.includes(merged.scoring)) {
    merged.scoring = DEFAULT_SETTINGS.scoring;
  }
  merged.profileAxes = cleanProfileAxes(merged.profileAxes);
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

/** Per-pair delta applied to BOTH guesser and target, given a scoring mode. */
function pairDelta(
  picks: string[],
  intended: Set<string>,
  scoring: ScoringMode,
): number {
  let hits = 0;
  for (const p of picks) if (intended.has(p)) hits++;
  const misses = picks.length - hits;
  switch (scoring) {
    case "symmetric":
      return hits - misses;
    case "generous":
      return 2 * hits - misses;
    case "risky":
      return riskyReward(hits) - riskyReward(misses);
  }
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
    profile: [],
    clueHistory: [],
    hitsThisRound: new Map(),
    wordScoreAsGuesser: 0,
    wordScoreAsTarget: 0,
    profileScoreAsGuesser: 0,
    profileScoreAsTarget: 0,
    accuracyBonus: 0,
  };
}

function randomProfile(numAxes: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < numAxes; i++) {
    result.push(
      PROFILE_AXIS_MIN +
        Math.floor(Math.random() * (PROFILE_AXIS_MAX - PROFILE_AXIS_MIN + 1)),
    );
  }
  return result;
}

function cleanAxisLabel(s: unknown, fallback: string): string {
  if (typeof s !== "string") return fallback;
  const trimmed = s.trim().slice(0, AXIS_LABEL_MAX_LEN);
  return trimmed || fallback;
}

function cleanProfileAxes(raw: unknown): AxisPair[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_PROFILE_AXES;
  const cleaned: AxisPair[] = [];
  for (const item of raw as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const obj = item as { left?: unknown; right?: unknown };
    cleaned.push({
      left: cleanAxisLabel(obj.left, "Low"),
      right: cleanAxisLabel(obj.right, "High"),
    });
    if (cleaned.length >= PROFILE_AXES_MAX) break;
  }
  if (cleaned.length < PROFILE_AXES_MIN) return DEFAULT_PROFILE_AXES;
  return cleaned;
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
    profileGuessSums: new Map(),
    profileGuessSamples: new Map(),
    history: [],
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
  for (const p of room.players) {
    p.profile = randomProfile(room.settings.profileAxes.length);
  }
  room.phase = "round";
  room.round = newRound(room, 1);
  syncAllBankActivity(room, Date.now());
}

function newRound(room: Room, number: number, pool?: string[]): Round {
  return {
    number,
    pool: pool ?? drawPool(room.settings.language, room.settings.poolSize),
    startedAt: Date.now(),
    clues: new Map(),
    guesses: new Map(),
    guessStartedAt: new Map(),
    labels: assignLabels(room.players),
    profileGuesses: new Map(),
  };
}

/** Compute the next round's pool: keep words that no one targeted, refill the rest with fresh draws. */
function carryPoolForward(room: Room, prev: Round): string[] {
  const targeted = new Set<string>();
  for (const clue of prev.clues.values()) {
    for (const w of clue.intended) targeted.add(w);
  }
  const survivors = prev.pool.filter((w) => !targeted.has(w));
  const need = room.settings.poolSize - survivors.length;
  if (need <= 0) return survivors.slice(0, room.settings.poolSize);
  const exclude = new Set(survivors);
  const fresh = drawPool(room.settings.language, need, exclude);
  return [...survivors, ...fresh];
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
  axesRaw: number[],
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
  const axes = validateAxisGuess(axesRaw, room.settings.profileAxes.length);
  const now = Date.now();
  closeAllBanks(room, now);
  outer.set(targetId, picks);
  let profileOuter = round.profileGuesses.get(player.id);
  if (!profileOuter) {
    profileOuter = new Map();
    round.profileGuesses.set(player.id, profileOuter);
  }
  profileOuter.set(targetId, axes);
  // Note: we do NOT update `room.profileGuessSums` here. The public figure
  // (Nations panel) should reflect end-of-previous-round values only — current-round
  // guesses are folded in at round resolve. See `tryResolveRound`.
  applyBankTopUp(
    player,
    room.settings.guessPhaseSeconds,
    room.settings.maxBankSeconds,
  );
  syncAllBankActivity(room, now);
  tryResolveRound(room);
}

function validateAxisGuess(raw: unknown, expectedLength: number): number[] {
  if (!Array.isArray(raw)) throw new Error("Bad axis guess");
  if (raw.length !== expectedLength) {
    throw new Error(`Axis guess must have exactly ${expectedLength} values`);
  }
  const result: number[] = [];
  for (const v of raw) {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error("Axis values must be numbers");
    }
    const n = Math.round(v);
    if (n < PROFILE_AXIS_MIN || n > PROFILE_AXIS_MAX) {
      throw new Error(
        `Axis values must be between ${PROFILE_AXIS_MIN} and ${PROFILE_AXIS_MAX}`,
      );
    }
    result.push(n);
  }
  return result;
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
  for (const p of room.players) {
    p.lastRoundDelta = 0;
    p.hitsThisRound = new Map();
  }
  for (const guesserId of submitters) {
    const inner = round.guesses.get(guesserId)!;
    const profileInner = round.profileGuesses.get(guesserId);
    for (const targetId of submitters) {
      if (targetId === guesserId) continue;
      const picks = inner.get(targetId) ?? [];
      const intendedSet = new Set(round.clues.get(targetId)!.intended);
      const delta = pairDelta(picks, intendedSet, room.settings.scoring);
      const guesser = room.players.find((p) => p.id === guesserId)!;
      const target = room.players.find((p) => p.id === targetId)!;
      guesser.score += delta;
      guesser.lastRoundDelta += delta;
      guesser.wordScoreAsGuesser += delta;
      target.score += delta;
      target.lastRoundDelta += delta;
      target.wordScoreAsTarget += delta;

      // Profile scoring: per-axis +1 symmetric to both guesser and target.
      const axesGuess = profileInner?.get(targetId);
      if (axesGuess) {
        const axisHits: boolean[] = [];
        let axisCorrect = 0;
        for (let i = 0; i < axesGuess.length; i++) {
          const correct = axesGuess[i] === target.profile[i];
          axisHits.push(correct);
          if (correct) axisCorrect++;
        }
        guesser.hitsThisRound.set(targetId, axisHits);
        guesser.score += axisCorrect;
        guesser.lastRoundDelta += axisCorrect;
        guesser.profileScoreAsGuesser += axisCorrect;
        target.score += axisCorrect;
        target.lastRoundDelta += axisCorrect;
        target.profileScoreAsTarget += axisCorrect;
      }
    }
  }
  // Snapshot the resolved round before any further mutation.
  room.history.push(snapshotRound(round));
  // Append clue words to nations.
  for (const p of room.players) {
    const c = round.clues.get(p.id);
    if (c) p.clueHistory.push(c.word);
  }
  // Now (and only now) fold this round's profile guesses into the cumulative
  // public figure so the Nations panel updates end-of-round, not live.
  const numAxes = room.settings.profileAxes.length;
  for (const [, perTarget] of round.profileGuesses) {
    for (const [targetId, axesGuess] of perTarget) {
      let sums = room.profileGuessSums.get(targetId);
      if (!sums) {
        sums = new Array<number>(numAxes).fill(0);
        room.profileGuessSums.set(targetId, sums);
      }
      for (let i = 0; i < axesGuess.length; i++) sums[i] += axesGuess[i];
      room.profileGuessSamples.set(
        targetId,
        (room.profileGuessSamples.get(targetId) ?? 0) + 1,
      );
    }
  }
  // First-to-N detection (based on round-only scores; bonus applied AFTER game ends).
  const target = room.settings.pointsPerPlayer * room.players.length;
  const reachers = room.players.filter((p) => p.score >= target);
  if (reachers.length > 0) {
    applyPublicAccuracyBonus(room);
    // Highest final score wins (after bonus). Ties broken by score, then by reaching first.
    let winner = room.players[0];
    for (const p of room.players) {
      if (p.score > winner.score) winner = p;
    }
    room.phase = "ended";
    room.winnerId = winner.id;
    // Persist the full game log + ELO update. Best-effort; failures are logged but don't break the game.
    persistGame(room);
  } else {
    room.phase = "reveal";
  }
  // Round is over — pause everyone's bank.
  closeAllBanks(room, Date.now());
}

function applyPublicAccuracyBonus(room: Room): void {
  const numAxes = room.settings.profileAxes.length;
  for (const target of room.players) {
    const sums = room.profileGuessSums.get(target.id);
    const samples = room.profileGuessSamples.get(target.id) ?? 0;
    if (!sums || samples === 0) continue;
    let matches = 0;
    for (let i = 0; i < numAxes; i++) {
      const rounded = Math.round(sums[i] / samples);
      if (rounded === target.profile[i]) matches++;
    }
    const bonus = matches * room.settings.publicAccuracyBonus;
    target.score += bonus;
    target.lastRoundDelta += bonus;
    target.accuracyBonus += bonus;
  }
}

export function nextRound(room: Room, player: Player): void {
  if (!player.isHost) throw new Error("Only the host can advance the round");
  if (room.phase !== "reveal") throw new Error("Round isn't over");
  const next = (room.round?.number ?? 0) + 1;
  const carriedPool = room.round
    ? carryPoolForward(room, room.round)
    : undefined;
  room.phase = "round";
  room.round = newRound(room, next, carriedPool);
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

  const isAnonRound = room.phase === "round" && room.round !== null;
  const labels = room.round?.labels;

  const myProfileGuessesPublic: { [k: string]: number[] } = {};
  let publicRound = null;
  let publicMe = {
    clue: null as FullClue | null,
    guesses: {} as { [k: string]: string[] },
    profileGuesses: myProfileGuessesPublic,
    profile: me?.profile ?? [],
    owedAction: "idle" as OwedAction,
    nextTarget: null as PendingGuess | null,
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

    // Compute pending guesses (server convenience for agents).
    const pendingGuesses: PendingGuess[] = [];
    if (myClue) {
      const opps = Object.entries(cluesPublic)
        .map(([id, c]) => ({ id, c }))
        .sort((a, b) => a.c.submittedAt - b.c.submittedAt);
      for (const opp of opps) {
        if (round.guesses.get(playerId)?.has(opp.id)) continue;
        const player = room.players.find((p) => p.id === opp.id);
        if (!player) continue;
        const isAnon = isAnonRound;
        const displayName =
          isAnon && opp.id !== playerId
            ? labels?.get(opp.id) ?? player.name
            : player.name;
        pendingGuesses.push({
          playerId: opp.id,
          name: displayName,
          clueWord: opp.c.word,
          clueCount: opp.c.count,
        });
      }
    }

    publicRound = {
      number: round.number,
      pool: round.pool,
      startedAt: round.startedAt,
      hasClue: Array.from(round.clues.keys()),
      opponentClues: cluesPublic,
      allGuesses: guessesPublic,
      pendingGuesses,
    };
    const myGuesses: { [k: string]: string[] } = {};
    const guessesByMe = round.guesses.get(playerId);
    if (guessesByMe) {
      for (const [targetId, picks] of guessesByMe) {
        myGuesses[targetId] = picks;
      }
    }
    const myProfileGuesses = round.profileGuesses.get(playerId);
    if (myProfileGuesses) {
      for (const [targetId, axes] of myProfileGuesses) {
        myProfileGuessesPublic[targetId] = axes;
      }
    }
    publicMe = {
      clue: myClue,
      guesses: myGuesses,
      profileGuesses: myProfileGuessesPublic,
      profile: me?.profile ?? [],
      owedAction: "idle",
      nextTarget: pendingGuesses[0] ?? null,
      bankSeconds: me?.bankSeconds ?? 0,
      bankActiveSince: me?.bankActiveSince ?? null,
    };
  }

  // Compute owedAction now that we have the full public state.
  publicMe.owedAction = computeOwedAction(
    room,
    me ?? null,
    publicRound?.pendingGuesses ?? [],
  );

  // Build nations (always present once round exists).
  const nations: PublicNation[] = room.players.map((p) => buildNation(room, p));

  // Profile feedback for me at reveal/ended.
  let profileFeedback: ProfileFeedback | null = null;
  if (
    me &&
    (room.phase === "reveal" || room.phase === "ended") &&
    me.hitsThisRound.size > 0
  ) {
    const hits: { [k: string]: boolean[] } = {};
    for (const [t, h] of me.hitsThisRound) hits[t] = [...h];
    profileFeedback = { hits };
  }

  let trueProfiles: { [k: string]: number[] } | undefined;
  let accuracy: ProfileAccuracy[] | undefined;
  if (room.phase === "ended") {
    trueProfiles = {};
    for (const p of room.players) trueProfiles[p.id] = [...p.profile];
    accuracy = computeAccuracy(room);
  }

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
        realName: p.name,
        connected: p.socketId !== null,
        isHost: p.isHost,
        score: p.score,
        lastRoundDelta: p.lastRoundDelta,
        hideScore: false,
        anonymous: isAnonRound && !isMe,
        breakdown: {
          wordGuesser: p.wordScoreAsGuesser,
          wordTarget: p.wordScoreAsTarget,
          profileGuesser: p.profileScoreAsGuesser,
          profileTarget: p.profileScoreAsTarget,
          accuracyBonus: p.accuracyBonus,
        },
      };
    }),
    myPlayerId: playerId,
    isHost: me?.isHost ?? false,
    me: publicMe,
    round: publicRound,
    winnerId: room.winnerId,
    nations,
    profileFeedback,
    trueProfiles,
    accuracy,
  };
}

function computeAccuracy(room: Room): ProfileAccuracy[] {
  const numAxes = room.settings.profileAxes.length;
  return room.players.map((target) => {
    const sums = room.profileGuessSums.get(target.id);
    const samples = room.profileGuessSamples.get(target.id) ?? 0;
    const rawPublic: (number | null)[] = new Array(numAxes).fill(null);
    const roundedPublic: (number | null)[] = new Array(numAxes).fill(null);
    const matches: boolean[] = new Array(numAxes).fill(false);
    if (sums && samples > 0) {
      for (let i = 0; i < numAxes; i++) {
        const raw = sums[i] / samples;
        const r = Math.round(raw);
        rawPublic[i] = raw;
        roundedPublic[i] = r;
        matches[i] = r === target.profile[i];
      }
    }
    const matchCount = matches.filter((m) => m).length;
    return {
      playerId: target.id,
      matches,
      rawPublic,
      roundedPublic,
      truth: [...target.profile],
      bonus: matchCount * room.settings.publicAccuracyBonus,
    };
  });
}

function computeOwedAction(
  room: Room,
  me: Player | null,
  pendingGuesses: PendingGuess[],
): OwedAction {
  if (!me) return "idle";
  switch (room.phase) {
    case "lobby":
      return me.isHost ? "host_start" : "wait_for_start";
    case "round": {
      const round = room.round;
      if (!round) return "idle";
      if (!round.clues.has(me.id)) return "submit_clue";
      if (pendingGuesses.length > 0) return "submit_guess";
      return "wait_for_others";
    }
    case "reveal":
      return me.isHost ? "host_advance" : "wait_for_advance";
    case "ended":
      return "review";
    default:
      return "idle";
  }
}

function buildNation(room: Room, target: Player): PublicNation {
  const numAxes = room.settings.profileAxes.length;
  const sums = room.profileGuessSums.get(target.id);
  const samples = room.profileGuessSamples.get(target.id) ?? 0;
  const averageAxes: (number | null)[] = new Array(numAxes).fill(null);
  if (sums && samples > 0) {
    for (let i = 0; i < numAxes; i++) {
      averageAxes[i] = sums[i] / samples;
    }
  }
  return {
    playerId: target.id,
    name: target.name,
    clueHistory: [...target.clueHistory],
    averageAxes,
    guessSamples: samples,
  };
}
