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
  poolLangs: Record<string, string>;
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
}

export interface PlayerLog {
  id: string;
  name: string;
  finalScore: number;
  breakdown: {
    wordGuesser: number;
    wordTarget: number;
  };
}

export interface GameLog {
  version: 2;
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
    poolLangs: { ...round.poolLangs },
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
  };
}

function buildPlayerLog(player: Player): PlayerLog {
  return {
    id: player.id,
    name: player.name,
    finalScore: player.score,
    breakdown: {
      wordGuesser: player.wordScoreAsGuesser,
      wordTarget: player.wordScoreAsTarget,
    },
  };
}

export function buildGameLog(room: Room): GameLog {
  const endedAt = Date.now();
  const startedAt = room.history[0]?.startedAt ?? room.createdAt;
  const gameId = `${endedAt}-${room.code}`;
  return {
    version: 2,
    gameId,
    roomCode: room.code,
    startedAt,
    endedAt,
    durationSec: Math.round((endedAt - startedAt) / 1000),
    numRounds: room.history.length,
    numPlayers: room.players.length,
    settings: { ...room.settings },
    players: room.players.map((p) => buildPlayerLog(p)),
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
