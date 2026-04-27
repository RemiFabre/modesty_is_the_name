import { useState } from "react";
import type { PublicState } from "../../../shared/types";
import { getSocket } from "../socket";
import { NationsPanel } from "./Nations";
import { WordPool } from "./WordPool";

export function Reveal({ state }: { state: PublicState }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const round = state.round;
  if (!round) return null;

  const me = state.players.find((p) => p.id === state.myPlayerId);
  const myDelta = me?.lastRoundDelta ?? 0;

  // Build a unified list: every clue-submitter gets a card.
  const cluesById = round.opponentClues; // includes my own only if backend chose to; here it doesn't, so handle separately
  const myClue = state.me.clue;

  function nextRound() {
    setBusy(true);
    setError(null);
    getSocket().emit("round:next", (ack) => {
      setBusy(false);
      if (!ack.ok) setError(ack.error);
    });
  }

  return (
    <div className="app">
      <header className="header round-header">
        <div className="round-meta">
          <span className="muted">
            Round {round.number} · {state.roomCode}
          </span>
          <span className="muted">
            Score: <strong className="fg">{me?.score ?? 0}</strong>{" "}
            <span className={"delta " + (myDelta >= 0 ? "good" : "bad")}>
              {myDelta >= 0 ? `+${myDelta}` : myDelta}
            </span>
          </span>
        </div>
        <h1 className="reveal-title">Round results</h1>
      </header>
      <main className="main">
        {myClue && (
          <ClueResultCard
            state={state}
            ownerId={state.myPlayerId}
            ownerName="You"
            clue={{ ...myClue }}
            isMine
          />
        )}
        {Object.entries(cluesById).map(([ownerId, clue]) => {
          const owner = state.players.find((p) => p.id === ownerId);
          if (!owner) return null;
          return (
            <ClueResultCard
              key={ownerId}
              state={state}
              ownerId={ownerId}
              ownerName={owner.name}
              clue={clue}
            />
          );
        })}

        <ProfileResults state={state} />

        <NationsPanel state={state} />

        {state.isHost ? (
          <button
            className="primary big"
            disabled={busy}
            onClick={nextRound}
          >
            {busy ? "Starting…" : "Start next round"}
          </button>
        ) : (
          <p className="muted center">
            Waiting for the host to start the next round…
          </p>
        )}
        {error && <p className="error">{error}</p>}
      </main>
    </div>
  );
}

function ProfileResults({ state }: { state: PublicState }) {
  if (!state.settings.publicFigures) return null;
  const fb = state.profileFeedback;
  if (!fb) return null;
  const axes = state.settings.profileAxes;
  const targets = Object.keys(fb.hits);
  if (targets.length === 0) return null;

  return (
    <section className="card">
      <h2>Profile guesses</h2>
      <p className="muted small">
        Each axis: green ✓ if your guess was right, red ✗ if not. (+1 each.)
      </p>
      <ul className="profile-results">
        {targets.map((tid) => {
          const player = state.players.find((p) => p.id === tid);
          if (!player) return null;
          const axisHits = fb.hits[tid];
          const correctCount = axisHits.filter((h) => h).length;
          return (
            <li key={tid} className="profile-result">
              <div className="profile-result-head">
                <span className="player-name">
                  {player.realName ?? player.name}
                </span>
                <span className="muted small">
                  {correctCount} / {axes.length}
                </span>
              </div>
              <ul className="profile-result-axes">
                {axes.map((a, i) => (
                  <li
                    key={i}
                    className={axisHits[i] ? "axis-hit" : "axis-miss"}
                  >
                    <span className="axis-mark">
                      {axisHits[i] ? "✓" : "✗"}
                    </span>
                    <span className="muted small">
                      {a.left} ↔ {a.right}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ClueResultCard({
  state,
  ownerId,
  ownerName,
  clue,
  isMine,
}: {
  state: PublicState;
  ownerId: string;
  ownerName: string;
  clue: { word: string; count: number; intended?: string[] };
  isMine?: boolean;
}) {
  const round = state.round!;
  const intendedSet = new Set(clue.intended ?? []);
  // Per-guesser breakdown.
  const guessers = state.players.filter((p) => p.id !== ownerId);

  return (
    <section className="card">
      <h2>
        {ownerName}: <span className="clue-word">{clue.word}</span>{" "}
        <span className="clue-count">{clue.count}</span>
      </h2>
      <div className="reveal-pool">
        <WordPool
          words={round.pool}
          highlight={intendedSet}
          disabled
        />
      </div>
      <p className="muted small">
        Intended:{" "}
        {clue.intended && clue.intended.length > 0
          ? clue.intended.map((w) => w.toUpperCase()).join(" · ")
          : "-"}
      </p>
      <ul className="opponents">
        {guessers.map((g) => {
          const picks = round.allGuesses?.[g.id]?.[ownerId] ?? null;
          if (!picks) return null;
          let hits = 0;
          for (const p of picks) if (intendedSet.has(p)) hits++;
          const misses = picks.length - hits;
          const delta = hits - misses;
          return (
            <li key={g.id} className="reveal-row">
              <span className="player-name">
                {g.id === state.myPlayerId ? "You" : g.name}
              </span>
              <span className="reveal-picks">
                {picks.map((p) => (
                  <span
                    key={p}
                    className={
                      "tag " + (intendedSet.has(p) ? "tag-good" : "tag-bad")
                    }
                  >
                    {p}
                  </span>
                ))}
              </span>
              <span className={"delta " + (delta >= 0 ? "good" : "bad")}>
                {delta >= 0 ? `+${delta}` : delta}
              </span>
            </li>
          );
        })}
      </ul>
      {isMine && (
        <p className="muted small">
          (You see your own clue here too. Guesses against it are how others
          scored on you.)
        </p>
      )}
    </section>
  );
}
