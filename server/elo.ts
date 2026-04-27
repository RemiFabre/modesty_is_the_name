import * as fs from "node:fs";
import * as path from "node:path";
import type { GameLog } from "./persistence.ts";

const DATA_DIR = path.resolve(process.cwd(), "data");
const ELO_FILE = path.join(DATA_DIR, "elo.json");

/** FIDE-style stable values: 1200 default, K=20. We do not implement the
 *  K=40 → 20 → 10 progression for new players / titled players. */
export const DEFAULT_RATING = 1200;
export const K_FACTOR = 20;

export interface PlayerRating {
  rating: number;
  games: number;
  wins: number;
  totalScore: number;
  bestRating: number;
  worstRating: number;
}

export interface EloHistoryEntry {
  gameId: string;
  timestamp: number;
  K: number;
  results: Array<{
    name: string;
    rank: number;
    score: number;
    before: number;
    after: number;
    delta: number;
  }>;
}

export interface EloFile {
  version: 1;
  defaultRating: number;
  K: number;
  lastUpdated: number;
  ratings: Record<string, PlayerRating>;
  history: EloHistoryEntry[];
}

export type EloUpdate = EloHistoryEntry["results"][number];

function loadElo(): EloFile {
  if (!fs.existsSync(ELO_FILE)) {
    return {
      version: 1,
      defaultRating: DEFAULT_RATING,
      K: K_FACTOR,
      lastUpdated: 0,
      ratings: {},
      history: [],
    };
  }
  try {
    return JSON.parse(fs.readFileSync(ELO_FILE, "utf8"));
  } catch (err) {
    console.error("[elo] corrupt elo.json, starting fresh:", err);
    return {
      version: 1,
      defaultRating: DEFAULT_RATING,
      K: K_FACTOR,
      lastUpdated: 0,
      ratings: {},
      history: [],
    };
  }
}

function saveElo(elo: EloFile): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ELO_FILE, JSON.stringify(elo, null, 2));
}

function ensureRating(elo: EloFile, name: string): PlayerRating {
  if (!elo.ratings[name]) {
    elo.ratings[name] = {
      rating: DEFAULT_RATING,
      games: 0,
      wins: 0,
      totalScore: 0,
      bestRating: DEFAULT_RATING,
      worstRating: DEFAULT_RATING,
    };
  }
  return elo.ratings[name];
}

/** Pairwise multi-player ELO. For each pair (a, b), apply a partial K-update
 *  proportional to 1/(N-1) so the total per-game movement is bounded. */
export function updateEloForGame(log: GameLog): EloUpdate[] {
  const elo = loadElo();
  // Sorted by score descending. Ties keep their submission-order index.
  const sorted = [...log.players]
    .map((p) => ({ name: p.name, score: p.finalScore, isWinner: p.id === log.winnerId }))
    .sort((a, b) => b.score - a.score);
  const N = sorted.length;

  for (const p of sorted) ensureRating(elo, p.name);
  const before: Record<string, number> = {};
  for (const p of sorted) before[p.name] = elo.ratings[p.name].rating;
  const deltas: Record<string, number> = {};
  for (const p of sorted) deltas[p.name] = 0;

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const Ra = before[a.name];
      const Rb = before[b.name];
      const Ea = 1 / (1 + Math.pow(10, (Rb - Ra) / 400));
      let Sa: number;
      if (a.score > b.score) Sa = 1;
      else if (a.score < b.score) Sa = 0;
      else Sa = 0.5;
      const d = (K_FACTOR / (N - 1)) * (Sa - Ea);
      deltas[a.name] += d;
      deltas[b.name] -= d;
    }
  }

  const topScore = sorted[0]?.score ?? 0;
  const results: EloUpdate[] = sorted.map((p, i) => {
    const after = before[p.name] + deltas[p.name];
    const r = elo.ratings[p.name];
    r.rating = after;
    r.games += 1;
    r.totalScore += p.score;
    if (p.score === topScore) r.wins += 1;
    if (after > r.bestRating) r.bestRating = after;
    if (after < r.worstRating) r.worstRating = after;
    return {
      name: p.name,
      rank: i + 1,
      score: p.score,
      before: before[p.name],
      after,
      delta: deltas[p.name],
    };
  });

  const entry: EloHistoryEntry = {
    gameId: log.gameId,
    timestamp: log.endedAt,
    K: K_FACTOR,
    results,
  };
  elo.history.push(entry);
  elo.lastUpdated = Date.now();
  saveElo(elo);
  return results;
}
