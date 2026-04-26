import { useState } from "react";
import {
  LANGUAGE_NAMES,
  SCORING_MODE_INFO,
  type PublicState,
} from "../../../shared/types";
import { getSocket } from "../socket";

export function Lobby({ state }: { state: PublicState }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const url = `${window.location.origin}/r/${state.roomCode}`;
  const canStart = state.isHost && state.players.length >= 2 && !busy;
  const canShare = typeof navigator.share === "function";

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function shareLink() {
    if (canShare) {
      navigator
        .share({ title: "Modesty is the Name", url })
        .catch(() => {
          /* user cancelled */
        });
    } else {
      copyLink();
    }
  }

  function startGame() {
    setBusy(true);
    setError(null);
    getSocket().emit("room:start", (ack) => {
      setBusy(false);
      if (!ack.ok) setError(ack.error);
    });
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Lobby</h1>
        <p className="tagline">
          Room <strong className="code">{state.roomCode}</strong> ·{" "}
          {LANGUAGE_NAMES[state.settings.language]}
        </p>
      </header>
      <main className="main">
        <section className="card">
          <h2>Share this link</h2>
          <div className="url-row">
            <code className="url">{url}</code>
          </div>
          <div className="row">
            <button onClick={shareLink} className="primary">
              {canShare ? "Share link" : copied ? "Copied!" : "Copy link"}
            </button>
            {canShare && (
              <button onClick={copyLink} className="ghost">
                {copied ? "Copied!" : "Copy"}
              </button>
            )}
          </div>
        </section>

        <section className="card">
          <h2>Players ({state.players.length})</h2>
          <ul className="players">
            {state.players.map((p) => (
              <li key={p.id} className={p.connected ? "" : "offline"}>
                <span className="player-name">{p.name}</span>
                {p.id === state.myPlayerId && (
                  <span className="badge">you</span>
                )}
                {p.isHost && <span className="badge host">host</span>}
                {!p.connected && <span className="badge offline">away</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Settings</h2>
          <ul className="settings">
            <li>
              <span>Scoring</span>
              <strong>
                {SCORING_MODE_INFO[state.settings.scoring].label} (
                {SCORING_MODE_INFO[state.settings.scoring].short})
              </strong>
            </li>
            <li>
              <span>Profile axes</span>
              <strong>
                {state.settings.profileAxes
                  .map((a) => `${a.left}↔${a.right}`)
                  .join(" · ")}
              </strong>
            </li>
            <li>
              <span>Solve bonus</span>
              <strong>+{state.settings.solveBonus}</strong>
            </li>
            <li>
              <span>Pool size</span>
              <strong>{state.settings.poolSize}</strong>
            </li>
            <li>
              <span>Initial bank</span>
              <strong>{fmtTime(state.settings.initialBankSeconds)}</strong>
            </li>
            <li>
              <span>Max bank</span>
              <strong>{fmtTime(state.settings.maxBankSeconds)}</strong>
            </li>
            <li>
              <span>Top-up on clue submit</span>
              <strong>+{fmtTime(state.settings.cluePhaseSeconds)}</strong>
            </li>
            <li>
              <span>Top-up per guess</span>
              <strong>+{fmtTime(state.settings.guessPhaseSeconds)}</strong>
            </li>
            <li>
              <span>Target score</span>
              <strong>
                {state.settings.pointsPerPlayer} × {state.players.length} ={" "}
                {state.settings.pointsPerPlayer * state.players.length}
              </strong>
            </li>
          </ul>
        </section>

        {state.isHost ? (
          <button
            className="primary big"
            disabled={!canStart}
            onClick={startGame}
            title={
              state.players.length < 2 ? "Need at least 2 players" : undefined
            }
          >
            {busy
              ? "Starting…"
              : state.players.length < 2
                ? "Waiting for players…"
                : "Start game"}
          </button>
        ) : (
          <p className="muted center">Waiting for the host to start the game…</p>
        )}

        {error && <p className="error">{error}</p>}
      </main>
    </div>
  );
}

function fmtTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
