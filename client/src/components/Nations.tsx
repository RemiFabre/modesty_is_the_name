import type { AxisPair, PublicState } from "../../../shared/types";

export function NationsPanel({ state }: { state: PublicState }) {
  const axes = state.settings.profileAxes;
  const nations = state.nations;
  if (!nations || nations.length === 0) return null;

  return (
    <section className="card subtle">
      <h2>Nations</h2>
      <p className="muted small">
        What each player has said and how the table currently reads them.
      </p>
      <ul className="nations">
        {nations.map((n) => {
          const isMe = n.playerId === state.myPlayerId;
          const myProfile = isMe ? state.me.profile : null;
          return (
            <li key={n.playerId} className="nation">
              <div className="nation-head">
                <strong>{isMe ? `${n.name} (you)` : n.name}</strong>
                {n.guessSamples > 0 && (
                  <span className="muted small">
                    {n.guessSamples} read{n.guessSamples === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <div className="nation-clues">
                {n.clueHistory.length === 0 ? (
                  <span className="muted small">no clues yet</span>
                ) : (
                  n.clueHistory.map((c, i) => (
                    <span key={i} className="tag clue-tag">
                      {c}
                    </span>
                  ))
                )}
              </div>
              <div className="nation-axes">
                {axes.map((axis, i) => (
                  <AxisReading
                    key={i}
                    axis={axis}
                    average={n.averageAxes[i]}
                    selfValue={myProfile ? myProfile[i] : null}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AxisReading({
  axis,
  average,
  selfValue,
}: {
  axis: AxisPair;
  average: number | null;
  selfValue: number | null;
}) {
  // Render a 5-column track. The "average" appears as a fill marker.
  const avgPercent =
    average !== null ? ((average - 1) / 4) * 100 : null;
  const selfPercent =
    selfValue !== null ? ((selfValue - 1) / 4) * 100 : null;
  return (
    <div className="axis-reading">
      <div className="axis-reading-labels">
        <span>{axis.left}</span>
        <span>{axis.right}</span>
      </div>
      <div className="axis-track">
        {avgPercent !== null && (
          <div
            className="axis-marker axis-avg"
            style={{ left: `${avgPercent}%` }}
            title={`Table reads: ${average!.toFixed(1)}`}
          />
        )}
        {selfPercent !== null && (
          <div
            className="axis-marker axis-self"
            style={{ left: `${selfPercent}%` }}
            title={`You: ${selfValue}`}
          />
        )}
      </div>
      <div className="axis-reading-value muted small">
        {average !== null ? average.toFixed(1) : "-"}
        {selfValue !== null && (
          <span className="axis-self-tag">you: {selfValue}</span>
        )}
      </div>
    </div>
  );
}
