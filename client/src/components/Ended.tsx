import type {
  AxisPair,
  ProfileAccuracy,
  PublicNation,
  PublicPlayer,
  PublicState,
} from "../../../shared/types";

export function Ended({ state }: { state: PublicState }) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const winner =
    state.players.find((p) => p.id === state.winnerId) ?? ranked[0] ?? null;
  const target = state.settings.pointsPerPlayer * state.players.length;
  const axes = state.settings.profileAxes;

  return (
    <div className="app">
      <header className="header">
        <h1>Game over</h1>
        <p className="tagline">
          Target was {target} points · {state.players.length} player
          {state.players.length === 1 ? "" : "s"}
        </p>
      </header>
      <main className="main">
        {winner && (
          <section className="card winner-card">
            <div className="winner-trophy">🏆</div>
            <div className="winner-body">
              <p className="winner-label">Winner</p>
              <h2 className="winner-name">{winner.name}</h2>
              <p className="winner-score">{winner.score} points</p>
            </div>
          </section>
        )}

        {ranked.map((p, i) => (
          <PlayerScorecard
            key={p.id}
            player={p}
            rank={i + 1}
            isWinner={p.id === state.winnerId}
            isMe={p.id === state.myPlayerId}
            axes={axes}
            accuracy={state.accuracy?.find((a) => a.playerId === p.id)}
            nation={state.nations?.find((n) => n.playerId === p.id)}
            publicAccuracyBonus={state.settings.publicAccuracyBonus}
          />
        ))}
      </main>
    </div>
  );
}

function PlayerScorecard({
  player,
  rank,
  isWinner,
  isMe,
  axes,
  accuracy,
  nation,
  publicAccuracyBonus,
}: {
  player: PublicPlayer;
  rank: number;
  isWinner: boolean;
  isMe: boolean;
  axes: AxisPair[];
  accuracy?: ProfileAccuracy;
  nation?: PublicNation;
  publicAccuracyBonus: number;
}) {
  const b = player.breakdown;
  return (
    <section
      className={
        "card scorecard" +
        (isWinner ? " scorecard-winner" : "") +
        (isMe ? " scorecard-me" : "")
      }
    >
      <header className="scorecard-head">
        <span className="scorecard-rank">#{rank}</span>
        <span className="scorecard-name">{player.name}</span>
        {isMe && <span className="badge">you</span>}
        {isWinner && <span className="badge host">winner</span>}
        <span className="scorecard-total">{player.score}</span>
      </header>

      <ul className="breakdown">
        <BreakdownRow
          label="Words you guessed correctly"
          icon="🎯"
          points={b.wordGuesser}
        />
        <BreakdownRow
          label="Words others got from you"
          icon="📣"
          points={b.wordTarget}
        />
        <BreakdownRow
          label="Profile axes you read right"
          icon="🔍"
          points={b.profileGuesser}
        />
        <BreakdownRow
          label="Profile axes others read right on you"
          icon="🪞"
          points={b.profileTarget}
        />
        <BreakdownRow
          label={`Public-figure accuracy bonus (+${publicAccuracyBonus} per matching axis)`}
          icon="✨"
          points={b.accuracyBonus}
        />
      </ul>

      {nation && nation.clueHistory.length > 0 && (
        <blockquote className="clue-quote">
          {nation.clueHistory.map((c, i) => (
            <span key={i} className="quoted-word">
              {c}
              {i < nation.clueHistory.length - 1 && (
                <span className="quote-sep"> · </span>
              )}
            </span>
          ))}
        </blockquote>
      )}

      {accuracy && (
        <div className="profile-readout">
          {axes.map((a, i) => (
            <AxisRow
              key={i}
              axis={a}
              truth={accuracy.truth[i]}
              raw={accuracy.rawPublic[i]}
              rounded={accuracy.roundedPublic[i]}
              match={accuracy.matches[i]}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function BreakdownRow({
  label,
  icon,
  points,
}: {
  label: string;
  icon: string;
  points: number;
}) {
  return (
    <li className="breakdown-row">
      <span className="breakdown-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="breakdown-label">{label}</span>
      <span
        className={
          "breakdown-points " +
          (points > 0 ? "good" : points < 0 ? "bad" : "muted")
        }
      >
        {points >= 0 ? `+${points}` : `${points}`}
      </span>
    </li>
  );
}

function AxisRow({
  axis,
  truth,
  raw,
  rounded,
  match,
}: {
  axis: AxisPair;
  truth: number;
  raw: number | null;
  rounded: number | null;
  match: boolean;
}) {
  // Convert 1..5 values to 0..1 percentages.
  const truthPct = ((truth - 1) / 4) * 100;
  const rawPct = raw !== null ? ((raw - 1) / 4) * 100 : null;
  const distance = raw !== null ? Math.abs(raw - truth) : null;

  return (
    <div className="axis-row">
      <div className="axis-row-labels">
        <span className="axis-end">{axis.left}</span>
        <span className="axis-end axis-end-right">{axis.right}</span>
      </div>
      <div className="axis-row-track">
        {/* tick marks for 1-5 */}
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className="axis-tick"
            style={{ left: `${((n - 1) / 4) * 100}%` }}
          />
        ))}
        <div
          className="axis-marker axis-truth"
          style={{ left: `${truthPct}%` }}
          title={`True: ${truth}`}
        />
        {rawPct !== null && (
          <div
            className="axis-marker axis-public"
            style={{ left: `${rawPct}%` }}
            title={`Public figure: ${raw!.toFixed(2)}`}
          />
        )}
      </div>
      <div className="axis-row-numbers">
        <span className="axis-number-truth">
          true <strong>{truth}</strong>
        </span>
        <span className="axis-number-pub">
          public{" "}
          <strong>{raw !== null ? raw.toFixed(2) : "-"}</strong>
          {rounded !== null && (
            <span className="muted small"> →{rounded}</span>
          )}
        </span>
        <span className={"axis-mark " + (match ? "axis-hit" : "axis-miss")}>
          {match ? "✓" : "✗"}
          {distance !== null && (
            <span className="muted small axis-distance">
              {" "}
              Δ{distance.toFixed(2)}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
