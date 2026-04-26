import type { PublicState } from "../../../shared/types";
import { fmtCountdown, useNow } from "../useNow";
import { ClueForm } from "./ClueForm";
import { WordPool } from "./WordPool";

export function Round({ state }: { state: PublicState }) {
  const now = useNow();
  const round = state.round;
  if (!round) return null;

  const me = state.players.find((p) => p.id === state.myPlayerId);
  const opponents = state.players.filter((p) => p.id !== state.myPlayerId);
  const haveClue = new Set(round.hasClue);

  const clueDeadline = round.startedAt + state.settings.cluePhaseSeconds * 1000;
  const myClue = state.me.clue;

  return (
    <div className="app">
      <header className="header round-header">
        <div className="round-meta">
          <span className="muted">
            Round {round.number} · {state.roomCode}
          </span>
          <span className="muted">
            Score: <strong className="fg">{me?.score ?? 0}</strong>
          </span>
        </div>
        <div className="round-clocks">
          <Clock
            label={myClue ? "Clue" : "Submit clue"}
            value={fmtCountdown(clueDeadline, now)}
            danger={now > clueDeadline}
            done={Boolean(myClue)}
          />
          <Clock
            label="Time bank"
            value={fmtBank(state.me.bankSeconds)}
            danger={state.me.bankSeconds <= 0}
          />
        </div>
      </header>
      <main className="main">
        <section className="card">
          <h2>Public words ({round.pool.length})</h2>
          <WordPool words={round.pool} />
        </section>

        {myClue ? (
          <SubmittedView
            state={state}
            opponents={opponents}
            haveClue={haveClue}
          />
        ) : (
          <>
            <p className="muted center">
              {pluralWaiting(opponents.length, haveClue)}
            </p>
            <ClueForm poolMax={round.pool.length} />
          </>
        )}
      </main>
    </div>
  );
}

function SubmittedView({
  state,
  opponents,
  haveClue,
}: {
  state: PublicState;
  opponents: { id: string; name: string }[];
  haveClue: Set<string>;
}) {
  const round = state.round!;
  const myClue = state.me.clue!;
  return (
    <>
      <section className="card">
        <h2>Your clue</h2>
        <p className="my-clue">
          <strong className="clue-word">{myClue.word}</strong>{" "}
          <span className="clue-count">{myClue.count}</span>
        </p>
      </section>
      <section className="card">
        <h2>Opponents</h2>
        <ul className="opponents">
          {opponents.map((opp) => {
            const submitted = haveClue.has(opp.id);
            const clue = round.opponentClues[opp.id];
            return (
              <li key={opp.id}>
                <span className="player-name">{opp.name}</span>
                {submitted && clue ? (
                  <span className="opp-clue">
                    <strong>{clue.word}</strong>
                    <span className="badge">{clue.count}</span>
                    <span className="muted small">
                      &nbsp;(guessing UI in next update)
                    </span>
                  </span>
                ) : submitted ? (
                  <span className="badge">submitted</span>
                ) : (
                  <span className="muted small">thinking…</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

function Clock({
  label,
  value,
  danger,
  done,
}: {
  label: string;
  value: string;
  danger?: boolean;
  done?: boolean;
}) {
  return (
    <div
      className={
        "clock" + (danger ? " clock-danger" : "") + (done ? " clock-done" : "")
      }
    >
      <span className="clock-label">{label}</span>
      <span className="clock-value">{value}</span>
    </div>
  );
}

function fmtBank(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(seconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}:${s.toString().padStart(2, "0")}`;
}

function pluralWaiting(opponents: number, haveClue: Set<string>): string {
  // haveClue includes me sometimes; we're called pre-submit, so it's only opponents.
  const submitted = haveClue.size;
  if (submitted === 0) return `Pick a clue. No one has submitted yet.`;
  if (submitted === opponents) return `All opponents have submitted. Hurry!`;
  return `${submitted} of ${opponents} opponent${opponents === 1 ? "" : "s"} submitted.`;
}
