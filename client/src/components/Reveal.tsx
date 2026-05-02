import { useState } from "react";
import type { PublicState } from "../../../shared/types";
import { getSocket } from "../socket";
import { ClueHistoryPanel } from "./ClueHistory";
import { ClueResultCard } from "./ClueResultCard";
import { Standings } from "./Standings";

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
            pool={round.pool}
            cols={state.settings.poolCols}
            ownerId={state.myPlayerId}
            ownerName="You"
            clue={{ ...myClue }}
            allGuesses={round.allGuesses}
            players={state.players}
            myPlayerId={state.myPlayerId}
            isMine
          />
        )}
        {Object.entries(cluesById).map(([ownerId, clue]) => {
          const owner = state.players.find((p) => p.id === ownerId);
          if (!owner) return null;
          return (
            <ClueResultCard
              key={ownerId}
              pool={round.pool}
              cols={state.settings.poolCols}
              ownerId={ownerId}
              ownerName={owner.realName}
              clue={clue}
              allGuesses={round.allGuesses}
              players={state.players}
              myPlayerId={state.myPlayerId}
            />
          );
        })}

        <Standings state={state} />

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
