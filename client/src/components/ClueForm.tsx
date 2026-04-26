import { useState } from "react";
import {
  CLUE_COUNT_MAX,
  CLUE_COUNT_MIN,
  CLUE_WORD_MAX_LEN,
} from "../../../shared/types";
import { getSocket } from "../socket";

const COUNTS = Array.from(
  { length: CLUE_COUNT_MAX - CLUE_COUNT_MIN + 1 },
  (_, i) => i + CLUE_COUNT_MIN,
);

export function ClueForm({ poolMax }: { poolMax: number }) {
  const [word, setWord] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = word.trim();
  const canSubmit = trimmed.length > 0 && count !== null && !busy;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || count === null) return;
    setBusy(true);
    setError(null);
    getSocket().emit(
      "clue:submit",
      { word: trimmed, count },
      (ack) => {
        setBusy(false);
        if (!ack.ok) setError(ack.error);
      },
    );
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Your clue</h2>
      <p className="muted">
        Pick one word and a number. You're claiming that <em>that many</em>{" "}
        public words connect to your clue.
      </p>
      <label className="field">
        <span>Clue word</span>
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
      <div className="field">
        <span>How many public words?</span>
        <div className="counts">
          {COUNTS.map((n) => {
            const exceedsPool = n > poolMax;
            return (
              <button
                key={n}
                type="button"
                className={
                  "count-btn " +
                  (count === n ? "count-on" : "") +
                  (exceedsPool ? " count-warn" : "")
                }
                onClick={() => setCount(n)}
                disabled={busy}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
      <button type="submit" className="primary big" disabled={!canSubmit}>
        {busy ? "Submitting…" : "Submit clue"}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
