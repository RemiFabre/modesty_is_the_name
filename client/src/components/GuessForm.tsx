import { useState } from "react";
import { getSocket } from "../socket";

export function GuessForm({
  targetId,
  targetName,
  clueWord,
  count,
  selected,
  onSubmitted,
}: {
  targetId: string;
  targetName: string;
  clueWord: string;
  count: number;
  selected: ReadonlySet<string>;
  onSubmitted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = count - selected.size;
  const canSubmit = remaining === 0 && !busy;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const picks = Array.from(selected);
    getSocket().emit("guess:submit", { targetId, picks }, (ack) => {
      setBusy(false);
      if (!ack.ok) {
        setError(ack.error);
        return;
      }
      onSubmitted();
    });
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Guessing {targetName}'s clue</h2>
      <p className="my-clue">
        <strong className="clue-word">{clueWord}</strong>{" "}
        <span className="clue-count">{count}</span>
      </p>
      <p className="muted">
        Tap exactly <strong>{count}</strong> word{count === 1 ? "" : "s"} above
        that you think {targetName} meant.
      </p>
      <div className="row sel-row">
        <span className="muted">
          {selected.size} of {count} selected
        </span>
      </div>
      <button type="submit" className="primary big" disabled={!canSubmit}>
        {busy
          ? "Submitting…"
          : remaining > 0
            ? `Pick ${remaining} more`
            : remaining < 0
              ? `Remove ${-remaining}`
              : "Submit guess"}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
