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
  PROFILE_BINARY_HIGH,
  PROFILE_BINARY_LOW,
  triangular,
  SCORING_MODES,
  SETTINGS_BOUNDS,
  type AxisPair,
  type Language,
  type ProfileMode,
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
  /** Score breakdown, accumulates over the game. score = sum of these. */
  wordScoreAsGuesser: number;
  wordScoreAsTarget: number;
  profileScoreAsGuesser: number;
  profileScoreAsTarget: number;
  accuracyBonus: number;
}

export interface Round {
  number: number;
  pool: string[];
  /** Per-pool-word canonical language. */
  poolLangs: Record<string, Language>;
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
  // Migrate legacy single-language config: { language: "fr" } → { languages: ["fr"] }
  const rawInput = input as Partial<RoomSettings> & { language?: string };
  if (
    typeof rawInput.language === "string" &&
    (!rawInput.languages || rawInput.languages.length === 0) &&
    LANGUAGES.includes(rawInput.language as Language)
  ) {
    merged.languages = [rawInput.language as Language];
  }
  // Validate languages list.
  if (!Array.isArray(merged.languages) || merged.languages.length === 0) {
    merged.languages = [...DEFAULT_SETTINGS.languages];
  }
  merged.languages = Array.from(
    new Set(merged.languages.filter((l) => LANGUAGES.includes(l))),
  );
  if (merged.languages.length === 0) {
    merged.languages = [...DEFAULT_SETTINGS.languages];
  }
  if (!SCORING_MODES.includes(merged.scoring)) {
    merged.scoring = DEFAULT_SETTINGS.scoring;
  }
  if (merged.profileMode !== "gradient" && merged.profileMode !== "binary") {
    merged.profileMode = DEFAULT_SETTINGS.profileMode;
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

/** Per-pair delta applied to BOTH guesser and target, given a scoring mode.
 *  When `uniqueness` is non-null, each correctly-guessed pick contributes
 *  U(w) instead of 1 (originality bonus). Misses always count as 1.
 *  Result is rounded to the nearest integer. */
function pairDelta(
  picks: string[],
  intended: Set<string>,
  scoring: ScoringMode,
  uniqueness: Map<string, number> | null,
): number {
  let hitsWeight = 0;
  let hits = 0;
  for (const p of picks) {
    if (intended.has(p)) {
      hitsWeight += uniqueness ? (uniqueness.get(p) ?? 1) : 1;
      hits++;
    }
  }
  const misses = picks.length - hits;
  let raw: number;
  switch (scoring) {
    case "symmetric":
      raw = hitsWeight - misses;
      break;
    case "generous":
      raw = 2 * hitsWeight - misses;
      break;
    case "precision":
      // All-or-nothing: if every pick was correct, reward = sum(U) * (N+1)/2.
      // With U=1 everywhere this collapses to T(N). With U=0 it collapses to 0.
      raw = misses === 0 ? (hitsWeight * (picks.length + 1)) / 2 : 0;
      break;
  }
  return Math.round(raw);
}

/** Build the per-word originality weight map for a round.
 *  U(w) = 1 - (c(w) - 1) / max(N - 1, 1), where c(w) = number of cluers (this
 *  round) whose intended set contains w, and N = number of cluers. */
function computeUniqueness(round: Round): Map<string, number> {
  const cluerCount = new Map<string, number>();
  for (const [, clue] of round.clues) {
    for (const w of clue.intended) {
      cluerCount.set(w, (cluerCount.get(w) ?? 0) + 1);
    }
  }
  const N = round.clues.size;
  const denom = Math.max(N - 1, 1);
  const uniqueness = new Map<string, number>();
  for (const [w, c] of cluerCount) {
    uniqueness.set(w, 1 - (c - 1) / denom);
  }
  return uniqueness;
}

/**
 * Polyglot cluster bonus: when ALL intended words are correctly guessed AND
 * the room has multiple languages enabled, partition the matched words into
 * "horizontal slices" (each slice = one cluster of words from distinct
 * languages). Sum T(slice_size). Symmetric (returns the per-pair bonus).
 *
 * Example: matched picks have 3 EN + 2 FR + 1 ES.
 *   Slices: {EN,FR,ES}=3 → +6,  {EN,FR}=2 → +3,  {EN}=1 → +1.  Total +10.
 */
function polyglotClusterBonus(
  matchedPicks: string[],
  poolLangs: Record<string, Language>,
): number {
  const counts = new Map<Language, number>();
  for (const w of matchedPicks) {
    const l = poolLangs[w];
    if (!l) continue;
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  if (counts.size === 0) return 0;
  // Sort counts descending. Slice r contributes T(number_of_langs_with_count >= r+1).
  const sortedCounts = Array.from(counts.values()).sort((a, b) => b - a);
  const maxCount = sortedCounts[0];
  let bonus = 0;
  for (let r = 0; r < maxCount; r++) {
    let langsAtRow = 0;
    for (const c of sortedCounts) if (c > r) langsAtRow++;
    bonus += triangular(langsAtRow);
  }
  return bonus;
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

function randomProfile(numAxes: number, mode: ProfileMode): number[] {
  const result: number[] = [];
  for (let i = 0; i < numAxes; i++) {
    if (mode === "binary") {
      result.push(Math.random() < 0.5 ? PROFILE_BINARY_LOW : PROFILE_BINARY_HIGH);
    } else {
      result.push(
        PROFILE_AXIS_MIN +
          Math.floor(Math.random() * (PROFILE_AXIS_MAX - PROFILE_AXIS_MIN + 1)),
      );
    }
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
    p.profile = randomProfile(
      room.settings.profileAxes.length,
      room.settings.profileMode,
    );
  }
  room.phase = "round";
  room.round = newRound(room, 1);
  syncAllBankActivity(room, Date.now());
}

function newRound(
  room: Room,
  number: number,
  pool?: string[],
  poolLangs?: Record<string, Language>,
): Round {
  let resolvedPool = pool;
  let resolvedLangs = poolLangs;
  if (!resolvedPool || !resolvedLangs) {
    const drawn = drawPool(room.settings.languages, room.settings.poolSize);
    resolvedPool = drawn.words;
    resolvedLangs = drawn.langs;
  }
  return {
    number,
    pool: resolvedPool,
    poolLangs: resolvedLangs,
    startedAt: Date.now(),
    clues: new Map(),
    guesses: new Map(),
    guessStartedAt: new Map(),
    labels: assignLabels(room.players),
    profileGuesses: new Map(),
  };
}

/** Compute the next round's pool: keep words that no one targeted, refill the rest with fresh draws. */
function carryPoolForward(
  room: Room,
  prev: Round,
): { pool: string[]; poolLangs: Record<string, Language> } {
  const targeted = new Set<string>();
  for (const clue of prev.clues.values()) {
    for (const w of clue.intended) targeted.add(w);
  }
  const survivors = prev.pool.filter((w) => !targeted.has(w));
  const need = room.settings.poolSize - survivors.length;
  // Build the lang map from survivors (preserving prior tags).
  const langs: Record<string, Language> = {};
  for (const w of survivors) {
    if (prev.poolLangs[w]) langs[w] = prev.poolLangs[w];
  }
  if (need <= 0) {
    return {
      pool: survivors.slice(0, room.settings.poolSize),
      poolLangs: langs,
    };
  }
  // Exclude both survivors (already in pool) AND targeted words (just removed)
  // — otherwise drawPool can resurrect a word that was just clued.
  const exclude = new Set([...survivors, ...targeted]);
  const fresh = drawPool(room.settings.languages, need, exclude);
  for (const w of fresh.words) langs[w] = fresh.langs[w];
  return { pool: [...survivors, ...fresh.words], poolLangs: langs };
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
  const axes = room.settings.publicFigures
    ? validateAxisGuess(
        axesRaw,
        room.settings.profileAxes.length,
        room.settings.profileMode,
      )
    : [];
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
  // (Nations panel) should reflect end-of-previous-round values only, current-round
  // guesses are folded in at round resolve. See `tryResolveRound`.
  applyBankTopUp(
    player,
    room.settings.guessPhaseSeconds,
    room.settings.maxBankSeconds,
  );
  syncAllBankActivity(room, now);
  tryResolveRound(room);
}

function validateAxisGuess(
  raw: unknown,
  expectedLength: number,
  mode: ProfileMode,
): number[] {
  if (!Array.isArray(raw)) throw new Error("Bad axis guess");
  if (raw.length !== expectedLength) {
    throw new Error(`Axis guess must have exactly ${expectedLength} values`);
  }
  const result: number[] = [];
  for (const v of raw) {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error("Axis values must be numbers");
    }
    let n = Math.round(v);
    if (mode === "binary") {
      if (n !== PROFILE_BINARY_LOW && n !== PROFILE_BINARY_HIGH) {
        throw new Error(
          `In binary mode, axis values must be exactly ${PROFILE_BINARY_LOW} or ${PROFILE_BINARY_HIGH}`,
        );
      }
    } else {
      if (n < PROFILE_AXIS_MIN || n > PROFILE_AXIS_MAX) {
        throw new Error(
          `Axis values must be between ${PROFILE_AXIS_MIN} and ${PROFILE_AXIS_MAX}`,
        );
      }
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
  // Don't resolve while any connected player still hasn't submitted a clue —
  // otherwise fast players close out a round before slow ones get to play.
  // Disconnected players are skipped so a rage-quit doesn't stall the room.
  const connected = room.players.filter((p) => p.socketId !== null);
  for (const p of connected) {
    if (!round.clues.has(p.id)) return;
  }
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
  const uniqueness = room.settings.originalityBonus
    ? computeUniqueness(round)
    : null;
  for (const guesserId of submitters) {
    const inner = round.guesses.get(guesserId)!;
    const profileInner = round.profileGuesses.get(guesserId);
    for (const targetId of submitters) {
      if (targetId === guesserId) continue;
      const picks = inner.get(targetId) ?? [];
      const intendedSet = new Set(round.clues.get(targetId)!.intended);
      let delta = pairDelta(picks, intendedSet, room.settings.scoring, uniqueness);
      // Polyglot cluster bonus: only when EVERY pick is correct AND there are
      // multiple languages active in the room.
      const allCorrect = picks.every((p) => intendedSet.has(p));
      if (
        allCorrect &&
        picks.length > 0 &&
        room.settings.polyglotBonus &&
        room.settings.languages.length > 1
      ) {
        delta += polyglotClusterBonus(picks, round.poolLangs);
      }
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
  if (room.settings.publicFigures) {
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
  }
  // First-to-N detection (based on round-only scores; bonus applied AFTER game ends).
  const target = room.settings.pointsPerPlayer * room.players.length;
  const reachers = room.players.filter((p) => p.score >= target);
  if (reachers.length > 0) {
    if (room.settings.publicFigures) applyPublicAccuracyBonus(room);
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
  // Round is over, pause everyone's bank.
  closeAllBanks(room, Date.now());
}

function snapToValid(avg: number, mode: ProfileMode): number {
  if (mode === "binary") {
    // Threshold midway between 1 and 5 (= 3): below → 1 (LOW), at-or-above → 5 (HIGH).
    return avg < 3 ? PROFILE_BINARY_LOW : PROFILE_BINARY_HIGH;
  }
  return Math.round(avg);
}

function applyPublicAccuracyBonus(room: Room): void {
  const numAxes = room.settings.profileAxes.length;
  for (const target of room.players) {
    const sums = room.profileGuessSums.get(target.id);
    const samples = room.profileGuessSamples.get(target.id) ?? 0;
    if (!sums || samples === 0) continue;
    let matches = 0;
    for (let i = 0; i < numAxes; i++) {
      const rounded = snapToValid(sums[i] / samples, room.settings.profileMode);
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
  const carried = room.round ? carryPoolForward(room, room.round) : undefined;
  room.phase = "round";
  room.round = newRound(room, next, carried?.pool, carried?.poolLangs);
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
      poolLangs: { ...round.poolLangs },
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
        const r = snapToValid(raw, room.settings.profileMode);
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
