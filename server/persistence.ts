import * as fs from "node:fs";
import * as path from "node:path";
import type { RoomSettings } from "../shared/types.ts";
import type { Player, Room, Round } from "./rooms.ts";
import { updateEloForGame, type EloUpdate } from "./elo.ts";

const DATA_DIR = path.resolve(process.cwd(), "data");
const GAMES_DIR = path.join(DATA_DIR, "games");

function ensureDirs(): void {
  fs.mkdirSync(GAMES_DIR, { recursive: true });
}

export interface RoundLog {
  number: number;
  pool: string[];
  startedAt: number;
  /** playerId → animal label assigned to them this round. */
  labels: Record<string, string>;
  /** playerId → clue. */
  clues: Record<
    string,
    { word: string; count: number; intended: string[]; submittedAt: number }
  >;
  /** guesserId → targetId → picks. */
  guesses: Record<string, Record<string, string[]>>;
  /** guesserId → targetId → axis values. */
  profileGuesses: Record<string, Record<string, number[]>>;
}

export interface PlayerLog {
  id: string;
  name: string;
  finalScore: number;
  breakdown: {
    wordGuesser: number;
    wordTarget: number;
    profileGuesser: number;
    profileTarget: number;
    accuracyBonus: number;
  };
  trueProfile: number[];
  /** Cumulative public-figure averages at game end (pre-rounding). */
  publicAxes: (number | null)[];
  /** Whether the rounded public-figure matched the true value (per axis). */
  axisMatches: boolean[];
}

export interface GameLog {
  version: 1;
  gameId: string;
  roomCode: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  numRounds: number;
  numPlayers: number;
  settings: RoomSettings;
  players: PlayerLog[];
  rounds: RoundLog[];
  winnerId: string | null;
}

export function snapshotRound(round: Round): RoundLog {
  return {
    number: round.number,
    pool: [...round.pool],
    startedAt: round.startedAt,
    labels: Object.fromEntries(round.labels),
    clues: Object.fromEntries(
      [...round.clues].map(([id, c]) => [
        id,
        {
          word: c.word,
          count: c.count,
          intended: [...c.intended],
          submittedAt: c.submittedAt,
        },
      ]),
    ),
    guesses: Object.fromEntries(
      [...round.guesses].map(([gId, perTarget]) => [
        gId,
        Object.fromEntries(
          [...perTarget].map(([tId, picks]) => [tId, [...picks]]),
        ),
      ]),
    ),
    profileGuesses: Object.fromEntries(
      [...round.profileGuesses].map(([gId, perTarget]) => [
        gId,
        Object.fromEntries(
          [...perTarget].map(([tId, axes]) => [tId, [...axes]]),
        ),
      ]),
    ),
  };
}

function buildPlayerLog(room: Room, player: Player): PlayerLog {
  const numAxes = room.settings.profileAxes.length;
  const sums = room.profileGuessSums.get(player.id);
  const samples = room.profileGuessSamples.get(player.id) ?? 0;
  const publicAxes: (number | null)[] = new Array(numAxes).fill(null);
  const axisMatches: boolean[] = new Array(numAxes).fill(false);
  if (sums && samples > 0) {
    for (let i = 0; i < numAxes; i++) {
      publicAxes[i] = sums[i] / samples;
      axisMatches[i] = Math.round(sums[i] / samples) === player.profile[i];
    }
  }
  return {
    id: player.id,
    name: player.name,
    finalScore: player.score,
    breakdown: {
      wordGuesser: player.wordScoreAsGuesser,
      wordTarget: player.wordScoreAsTarget,
      profileGuesser: player.profileScoreAsGuesser,
      profileTarget: player.profileScoreAsTarget,
      accuracyBonus: player.accuracyBonus,
    },
    trueProfile: [...player.profile],
    publicAxes,
    axisMatches,
  };
}

export function buildGameLog(room: Room): GameLog {
  const endedAt = Date.now();
  const startedAt = room.history[0]?.startedAt ?? room.createdAt;
  const gameId = `${endedAt}-${room.code}`;
  return {
    version: 1,
    gameId,
    roomCode: room.code,
    startedAt,
    endedAt,
    durationSec: Math.round((endedAt - startedAt) / 1000),
    numRounds: room.history.length,
    numPlayers: room.players.length,
    settings: { ...room.settings, profileAxes: [...room.settings.profileAxes] },
    players: room.players.map((p) => buildPlayerLog(room, p)),
    rounds: [...room.history],
    winnerId: room.winnerId,
  };
}

export interface PersistResult {
  log: GameLog;
  filename: string;
  elo: EloUpdate[];
}

export function persistGame(room: Room): PersistResult | null {
  try {
    ensureDirs();
    const log = buildGameLog(room);
    const filename = `${log.endedAt}-${log.roomCode}.json`;
    fs.writeFileSync(
      path.join(GAMES_DIR, filename),
      JSON.stringify(log, null, 2),
    );
    const elo = updateEloForGame(log);
    console.log(
      `[persistence] saved game ${log.gameId} (${log.numRounds} rounds, ${log.numPlayers} players); elo: ${elo
        .map(
          (e) =>
            `${e.name} ${e.delta >= 0 ? "+" : ""}${e.delta.toFixed(1)} → ${Math.round(e.after)}`,
        )
        .join(", ")}`,
    );
    return { log, filename, elo };
  } catch (err) {
    console.error("[persistence] failed:", err);
    return null;
  }
}
