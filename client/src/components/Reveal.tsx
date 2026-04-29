import { useState } from "react";
import type { PublicState } from "../../../shared/types";
import { getSocket } from "../socket";
import { ClueHistoryPanel } from "./ClueHistory";
import { WordPool } from "./WordPool";

export function Reveal({ state }: { state: PublicState }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const round = state.round;
  if (!round) return null;

  const me = state.players.find((p) => p.id === state.myPlayerId);
  const myDelta = me?.lastRoundDelta ?? 0;

  const cluesById = round.opponentClues;
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

        <ClueHistoryPanel state={state} />

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
          cols={state.settings.poolCols}
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
