import type { PublicState } from "../../../shared/types";

export function ClueHistoryPanel({ state }: { state: PublicState }) {
  const histories = state.clueHistories;
  if (!histories || histories.length === 0) return null;

  return (
    <section className="card subtle">
      <h2>Clue history</h2>
      <p className="muted small">What each player has clued so far.</p>
      <ul className="clue-histories">
        {histories.map((h) => {
          return (
            <li key={h.playerId} className="clue-history">
              <div className="clue-history-head">
                <strong>{h.name}</strong>
              </div>
              <div className="clue-history-words">
                {h.clueHistory.length === 0 ? (
                  <span className="muted small">no clues yet</span>
                ) : (
                  h.clueHistory.map((c, i) => (
                    <span key={i} className="tag clue-tag">
                      {c}
                    </span>
                  ))
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
