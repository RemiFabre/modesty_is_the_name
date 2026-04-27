import { useEffect, useMemo, useState } from "react";
import {
  CLUE_COUNT_MAX,
  CLUE_COUNT_MIN,
  CLUE_WORD_MAX_LEN,
  PROFILE_AXIS_MAX,
  PROFILE_AXIS_MIN,
  PROFILE_AXIS_VALUES,
  PROFILE_BINARY_HIGH,
  PROFILE_BINARY_LOW,
  type AxisPair,
  type ProfileMode,
  type PublicClue,
  type PublicPlayer,
  type PublicState,
} from "../../../shared/types";
import { NationsPanel } from "./Nations";
import { getSocket } from "../socket";
import { useNow } from "../useNow";
import { WordPool } from "./WordPool";

interface OpponentClueRow {
  player: PublicPlayer;
  clue: PublicClue;
  guessed: boolean;
}

type Activity =
  | { kind: "clue" }
  | { kind: "guess"; row: OpponentClueRow }
  | { kind: "wait" };

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

  const activity: Activity = !myClue
    ? { kind: "clue" }
    : nextOpponent
      ? { kind: "guess", row: nextOpponent }
      : { kind: "wait" };

  const [selected, setSelected] = useState<Set<string>>(new Set());

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
        if (activity.kind === "guess" && next.size >= targetCount) return prev;
        if (activity.kind === "clue" && next.size >= CLUE_COUNT_MAX) return prev;
        next.add(word);
      }
      return next;
    });
  }

  const interactive = activity.kind === "clue" || activity.kind === "guess";
  const liveBank = computeLiveBank(state.me.bankSeconds, state.me.bankActiveSince, now);

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
            label={
              activity.kind === "clue"
                ? "Your clock"
                : activity.kind === "guess"
                  ? `Your clock, guessing ${activity.row.player.name}`
                  : "Your clock, waiting"
            }
            value={fmtBank(liveBank)}
            danger={liveBank < 0}
            done={activity.kind === "wait"}
          />
        </div>
        <p className="anon-hint muted small">
          Players are shown by random anonymous labels until the round ends.
        </p>
      </header>
      <main className="main">
        <InstructionPrompt
          activity={activity}
          profilesActive={state.settings.publicFigures}
        />

        <section className="card pool-card">
          <WordPool
            words={round.pool}
            selected={selected}
            onToggle={interactive ? toggle : undefined}
            disabled={!interactive}
          />
        </section>

        {activity.kind === "clue" && (
          <ClueAction selected={selected} onSubmitted={() => setSelected(new Set())} />
        )}
        {activity.kind === "guess" && (
          <GuessAction
            targetId={activity.row.player.id}
            targetName={activity.row.player.name}
            count={activity.row.clue.count}
            selected={selected}
            axes={state.settings.profileAxes}
            profileMode={state.settings.profileMode}
            profilesActive={state.settings.publicFigures}
            onSubmitted={() => setSelected(new Set())}
          />
        )}
        {activity.kind === "wait" && (
          <WaitingPanel
            opponents={opponents}
            hasClue={round.hasClue}
            myGuesses={state.me.guesses}
          />
        )}

        <Standings state={state} />

        <NationsPanel state={state} />

        {myClue && (
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

function InstructionPrompt({
  activity,
  profilesActive,
}: {
  activity: Activity;
  profilesActive: boolean;
}) {
  if (activity.kind === "clue") {
    return (
      <section className="prompt">
        <p>
          Tap the public words you want others to find, then type your clue word
          below. Pick between {CLUE_COUNT_MIN} and {CLUE_COUNT_MAX} words.
        </p>
        {profilesActive && (
          <p className="muted small">
            If you can, pick a clue word that fits your private profile.
            Opponents who read your axes right give <strong>you</strong> points
            too, and there's an end-of-game bonus for being clearly readable.
          </p>
        )}
        <p className="muted small">
          Heads-up: every word any player picks here is removed from the pool
          next round and replaced with a fresh one. Words no one targets stay.
        </p>
      </section>
    );
  }
  if (activity.kind === "guess") {
    const { player, clue } = activity.row;
    return (
      <section className="prompt prompt-guess">
        <p>
          Find the{" "}
          <strong className="prompt-strong">{clue.count}</strong> word
          {clue.count === 1 ? "" : "s"} you think{" "}
          <strong className="prompt-strong">{player.name}</strong>{" "}
          <span className="anon-tag">(anonymous label)</span> meant by:
        </p>
        <p className="prompt-clue">{clue.word.toUpperCase()}</p>
      </section>
    );
  }
  return (
    <section className="prompt">
      <p className="muted">
        You've guessed for everyone who has submitted. Waiting for the rest of
        the table…
      </p>
    </section>
  );
}

function ClueAction({
  selected,
  onSubmitted,
}: {
  selected: ReadonlySet<string>;
  onSubmitted: () => void;
}) {
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = word.trim();
  const count = selected.size;
  const validCount = count >= CLUE_COUNT_MIN && count <= CLUE_COUNT_MAX;
  const canSubmit = trimmed.length > 0 && validCount && !busy;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    getSocket().emit(
      "clue:submit",
      { word: trimmed, intended: Array.from(selected) },
      (ack) => {
        setBusy(false);
        if (!ack.ok) {
          setError(ack.error);
          return;
        }
        setWord("");
        onSubmitted();
      },
    );
  }

  return (
    <form className="card action-card" onSubmit={submit}>
      <label className="field">
        <span>Your clue word ({count} word{count === 1 ? "" : "s"} selected)</span>
        <input
          autoFocus
          value={word}
          onChange={(e) => setWord(e.target.value)}
          maxLength={CLUE_WORD_MAX_LEN}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="e.g. truck"
          disabled={busy}
        />
      </label>
      <button type="submit" className="primary big" disabled={!canSubmit}>
        {busy ? "Submitting…" : `Submit clue (${count})`}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function GuessAction({
  targetId,
  targetName,
  count,
  selected,
  axes,
  profileMode,
  profilesActive,
  onSubmitted,
}: {
  targetId: string;
  targetName: string;
  count: number;
  selected: ReadonlySet<string>;
  axes: AxisPair[];
  profileMode: ProfileMode;
  profilesActive: boolean;
  onSubmitted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Default depends on mode: gradient defaults to middle (3) for quick submit;
  // binary defaults to 0 (unselected sentinel) so user must commit. When profiles
  // are off, the array is empty and the UI block is hidden.
  const [axisValues, setAxisValues] = useState<number[]>(() =>
    profilesActive
      ? new Array(axes.length).fill(profileMode === "binary" ? 0 : 3)
      : [],
  );
  // Reset axis values when we switch to a different opponent (or the axis count or mode changed).
  useEffect(() => {
    setAxisValues(
      profilesActive
        ? new Array(axes.length).fill(profileMode === "binary" ? 0 : 3)
        : [],
    );
    // intentionally only depending on these scalars, `axes` is a new array
    // reference on every state broadcast, which would otherwise reset user input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, axes.length, profileMode, profilesActive]);

  const remaining = count - selected.size;
  const wordsOk = remaining === 0;
  const axesOk = !profilesActive
    ? true
    : profileMode === "binary"
      ? axisValues.every(
          (v) => v === PROFILE_BINARY_LOW || v === PROFILE_BINARY_HIGH,
        )
      : axisValues.every(
          (v) => v >= PROFILE_AXIS_MIN && v <= PROFILE_AXIS_MAX,
        );
  const canSubmit = wordsOk && axesOk && !busy;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    getSocket().emit(
      "guess:submit",
      { targetId, picks: Array.from(selected), axes: axisValues },
      (ack) => {
        setBusy(false);
        if (!ack.ok) {
          setError(ack.error);
          return;
        }
        onSubmitted();
      },
    );
  }

  return (
    <form className="card action-card" onSubmit={submit}>
      {profilesActive && (
        <div className="axes">
          <h3>Guess {targetName}'s profile</h3>
          {axes.map((axis, i) => (
            <AxisGuess
              key={i}
              axis={axis}
              value={axisValues[i]}
              mode={profileMode}
              onChange={(v) =>
                setAxisValues((prev) => prev.map((x, j) => (j === i ? v : x)))
              }
              disabled={busy}
            />
          ))}
        </div>
      )}
      <p className="muted center">
        {selected.size} of {count} word{count === 1 ? "" : "s"} selected
      </p>
      <button type="submit" className="primary big" disabled={!canSubmit}>
        {busy
          ? "Submitting…"
          : remaining > 0
            ? `Pick ${remaining} more word${remaining === 1 ? "" : "s"}`
            : remaining < 0
              ? `Remove ${-remaining}`
              : `Submit guess for ${targetName}`}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function AxisGuess({
  axis,
  value,
  mode,
  onChange,
  disabled,
}: {
  axis: AxisPair;
  value: number;
  mode: ProfileMode;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  if (mode === "binary") {
    return (
      <div className="axis axis-binary">
        <div className="axis-binary-buttons">
          <button
            type="button"
            className={
              "axis-binary-btn axis-binary-left " +
              (value === PROFILE_BINARY_LOW ? "axis-on" : "")
            }
            onClick={() => onChange(PROFILE_BINARY_LOW)}
            disabled={disabled}
          >
            {axis.left}
          </button>
          <button
            type="button"
            className={
              "axis-binary-btn axis-binary-right " +
              (value === PROFILE_BINARY_HIGH ? "axis-on" : "")
            }
            onClick={() => onChange(PROFILE_BINARY_HIGH)}
            disabled={disabled}
          >
            {axis.right}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="axis">
      <div className="axis-labels">
        <span className="axis-end">{axis.left}</span>
        <span className="axis-end axis-end-right">{axis.right}</span>
      </div>
      <div className="axis-buttons">
        {PROFILE_AXIS_VALUES.map((n) => (
          <button
            key={n}
            type="button"
            className={"axis-btn " + (value === n ? "axis-on" : "")}
            onClick={() => onChange(n)}
            disabled={disabled}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function WaitingPanel({
  opponents,
  hasClue,
  myGuesses,
}: {
  opponents: PublicPlayer[];
  hasClue: string[];
  myGuesses: { [k: string]: string[] };
}) {
  return (
    <section className="card subtle">
      <h2>Waiting on</h2>
      <ul className="opponents">
        {opponents.map((opp) => {
          const submitted = hasClue.includes(opp.id);
          const guessed = Boolean(myGuesses[opp.id]);
          return (
            <li key={opp.id}>
              <span className="player-name">{opp.name}</span>
              {!submitted ? (
                <span className="muted small">thinking…</span>
              ) : guessed ? (
                <span className="badge">guessed</span>
              ) : (
                <span className="badge">clue submitted</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Standings({ state }: { state: PublicState }) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  return (
    <section className="card subtle">
      <h2>Standings</h2>
      <p className="muted small">
        Scores only update at the end of each round.
      </p>
      <ol className="rank">
        {ranked.map((p, i) => (
          <li
            key={p.id}
            className={p.id === state.myPlayerId ? "rank-me" : ""}
          >
            <span className="rank-pos">{i + 1}</span>
            <span className="player-name">
              {p.id === state.myPlayerId ? "You" : p.realName}
            </span>
            <span className="rank-score">{p.score}</span>
          </li>
        ))}
      </ol>
    </section>
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
  const abs = Math.abs(Math.floor(seconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}:${s.toString().padStart(2, "0")}`;
}

function computeLiveBank(
  snapshotSeconds: number,
  activeSince: number | null,
  now: number,
): number {
  if (activeSince === null) return snapshotSeconds;
  return snapshotSeconds - (now - activeSince) / 1000;
}
