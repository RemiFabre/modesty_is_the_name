import { useState } from "react";
import {
  CLUE_COUNT_MAX,
  CLUE_COUNT_MIN,
  CLUE_WORD_MAX_LEN,
} from "../../../shared/types";
import { getSocket } from "../socket";

export function ClueForm({
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
    const intended = Array.from(selected);
    getSocket().emit(
      "clue:submit",
      { word: trimmed, intended },
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
    <form className="card" onSubmit={submit}>
      <h2>Your clue</h2>
      <p className="muted">
        Tap the public words above that you want others to guess. Then choose a
        single clue word that connects them.
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
      <div className="row sel-row">
        <span className="muted">
          {count === 0
            ? "No words selected yet"
            : `${count} word${count === 1 ? "" : "s"} selected`}
        </span>
        {count > CLUE_COUNT_MAX && (
          <span className="error small">max {CLUE_COUNT_MAX}</span>
        )}
      </div>
      <button type="submit" className="primary big" disabled={!canSubmit}>
        {busy ? "Submitting…" : `Submit clue (${count})`}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
