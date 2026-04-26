import { useEffect, useMemo, useState } from "react";
import {
  CLUE_COUNT_MAX,
  type PublicClue,
  type PublicPlayer,
  type PublicState,
} from "../../../shared/types";
import { fmtCountdown, useNow } from "../useNow";
import { ClueForm } from "./ClueForm";
import { GuessForm } from "./GuessForm";
import { WordPool } from "./WordPool";

interface OpponentClueRow {
  player: PublicPlayer;
  clue: PublicClue;
  guessed: boolean;
}

export function Round({ state }: { state: PublicState }) {
  const now = useNow();
  const round = state.round;

  const me = state.players.find((p) => p.id === state.myPlayerId);
  const opponents = state.players.filter((p) => p.id !== state.myPlayerId);

  const myClue = state.me.clue;

  const opponentRows: OpponentClueRow[] = useMemo(() => {
    if (!round) return [];
    return Object.entries(round.opponentClues)
      .map(([id, clue]) => {
        const player = state.players.find((p) => p.id === id);
        if (!player) return null;
        const guessed = Boolean(state.me.guesses[id]);
        return { player, clue, guessed };
      })
      .filter((x): x is OpponentClueRow => x !== null)
      .sort((a, b) => a.clue.submittedAt - b.clue.submittedAt);
  }, [round, state.players, state.me.guesses]);

  const nextOpponent = opponentRows.find((r) => !r.guessed) ?? null;

  // Determine activity:
  type Activity =
    | { kind: "clue" }
    | { kind: "guess"; row: OpponentClueRow }
    | { kind: "wait" };
  const activity: Activity = !myClue
    ? { kind: "clue" }
    : nextOpponent
      ? { kind: "guess", row: nextOpponent }
      : { kind: "wait" };

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset selection when activity changes (different opponent or cluing→guessing).
  const activityKey =
    activity.kind === "guess" ? `guess:${activity.row.player.id}` : activity.kind;
  useEffect(() => {
    setSelected(new Set());
  }, [activityKey]);

  if (!round) return null;

  const targetCount =
    activity.kind === "guess"
      ? activity.row.clue.count
      : activity.kind === "clue"
        ? CLUE_COUNT_MAX
        : 0;

  function toggle(word: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(word)) {
        next.delete(word);
      } else {
        if (activity.kind === "guess" && next.size >= targetCount) {
          // Replace oldest? Simpler: ignore to avoid surprising behaviour.
          return prev;
        }
        if (activity.kind === "clue" && next.size >= CLUE_COUNT_MAX) {
          return prev;
        }
        next.add(word);
      }
      return next;
    });
  }

  const interactive = activity.kind === "clue" || activity.kind === "guess";

  const clueDeadline = round.startedAt + state.settings.cluePhaseSeconds * 1000;
  const myClueSubmittedAt = myClue?.submittedAt ?? round.startedAt;
  const guessDeadline =
    activity.kind === "guess"
      ? Math.max(activity.row.clue.submittedAt, myClueSubmittedAt) +
        state.settings.guessPhaseSeconds * 1000
      : null;

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
          {activity.kind === "guess" && guessDeadline ? (
            <Clock
              label={`Guess ${activity.row.player.name}`}
              value={fmtCountdown(guessDeadline, now)}
              danger={now > guessDeadline}
            />
          ) : (
            <Clock
              label={myClue ? "Clue submitted" : "Clue phase"}
              value={fmtCountdown(clueDeadline, now)}
              danger={!myClue && now > clueDeadline}
              done={Boolean(myClue) && activity.kind !== "guess"}
            />
          )}
          <Clock
            label="Time bank"
            value={fmtBank(state.me.bankSeconds)}
            danger={state.me.bankSeconds <= 0}
          />
        </div>
      </header>
      <main className="main">
        <section className="card">
          <h2>
            Public words
            {interactive && activity.kind === "guess"
              ? ` (pick ${targetCount})`
              : interactive && activity.kind === "clue"
                ? ` (tap to mark intended)`
                : ""}
          </h2>
          <WordPool
            words={round.pool}
            selected={selected}
            onToggle={interactive ? toggle : undefined}
            disabled={!interactive}
          />
        </section>

        {activity.kind === "clue" && (
          <ClueForm
            selected={selected}
            onSubmitted={() => setSelected(new Set())}
          />
        )}

        {activity.kind === "guess" && (
          <GuessForm
            targetId={activity.row.player.id}
            targetName={activity.row.player.name}
            clueWord={activity.row.clue.word}
            count={activity.row.clue.count}
            selected={selected}
            onSubmitted={() => setSelected(new Set())}
          />
        )}

        {activity.kind === "wait" && (
          <section className="card">
            <h2>Waiting</h2>
            <p className="muted">
              You've guessed for everyone who has submitted. Waiting for the
              remaining players…
            </p>
            <ul className="opponents">
              {opponents.map((opp) => {
                const submitted = round.hasClue.includes(opp.id);
                const guessed = Boolean(state.me.guesses[opp.id]);
                return (
                  <li key={opp.id}>
                    <span className="player-name">{opp.name}</span>
                    {!submitted ? (
                      <span className="muted small">thinking…</span>
                    ) : guessed ? (
                      <span className="badge">guessed</span>
                    ) : (
                      <span className="badge">submitted</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {myClue && (activity.kind === "guess" || activity.kind === "wait") && (
          <section className="card subtle">
            <h2>Your clue</h2>
            <p className="my-clue">
              <strong className="clue-word">{myClue.word}</strong>{" "}
              <span className="clue-count">{myClue.count}</span>
            </p>
          </section>
        )}
      </main>
    </div>
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
