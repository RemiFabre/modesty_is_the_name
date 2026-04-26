import { useState } from "react";
import {
  DEFAULT_SETTINGS,
  SCORING_MODE_INFO,
  SCORING_MODES,
  SETTINGS_BOUNDS,
  type Language,
  type RoomSettings,
  type ScoringMode,
} from "../../../shared/types";
import { getSocket } from "../socket";
import { loadName, saveName, saveSessionToken } from "../session";

export function Home({ onCreated }: { onCreated: (code: string) => void }) {
  const [name, setName] = useState(loadName());
  const [language, setLanguage] = useState<Language>("en");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [settings, setSettings] = useState<RoomSettings>({
    ...DEFAULT_SETTINGS,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");

  const trimmed = name.trim();
  const canCreate = trimmed.length > 0 && !busy;
  const canJoin = trimmed.length > 0 && joinCode.trim().length > 0 && !busy;

  function handleCreate() {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    saveName(trimmed);
    const socket = getSocket();
    socket.emit(
      "room:create",
      { hostName: trimmed, settings: { ...settings, language } },
      (ack) => {
        setBusy(false);
        if (!ack.ok) {
          setError(ack.error);
          return;
        }
        saveSessionToken(ack.roomCode, ack.sessionToken);
        onCreated(ack.roomCode);
      },
    );
  }

  function handleJoin() {
    if (!canJoin) return;
    const code = joinCode.trim().toUpperCase();
    saveName(trimmed);
    onCreated(code); // lazy: navigate; the Room page will perform the join
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Modesty is the Name</h1>
        <p className="tagline">a simultaneous word-association game</p>
      </header>
      <main className="main home">
        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Alex"
            autoComplete="given-name"
            maxLength={20}
          />
        </label>

        <section className="card">
          <h2>Create a game</h2>
          <label className="field">
            <span>Language</span>
            <div className="seg">
              <button
                type="button"
                className={language === "en" ? "seg-on" : ""}
                onClick={() => setLanguage("en")}
              >
                English
              </button>
              <button
                type="button"
                className={language === "fr" ? "seg-on" : ""}
                onClick={() => setLanguage("fr")}
              >
                Français
              </button>
            </div>
          </label>

          <label className="field">
            <span>Scoring</span>
            <div className="seg">
              {SCORING_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={settings.scoring === mode ? "seg-on" : ""}
                  onClick={() =>
                    setSettings((s) => ({ ...s, scoring: mode }))
                  }
                >
                  {SCORING_MODE_INFO[mode].label}
                </button>
              ))}
            </div>
            <span className="muted small">
              {SCORING_MODE_INFO[settings.scoring].description}
            </span>
          </label>

          <button
            type="button"
            className="link"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Hide" : "Show"} advanced settings
          </button>

          {showAdvanced && (
            <div className="settings-grid">
              <NumberField
                label="Initial bank (s)"
                value={settings.initialBankSeconds}
                bounds={SETTINGS_BOUNDS.initialBankSeconds}
                onChange={(v) =>
                  setSettings((s) => ({ ...s, initialBankSeconds: v }))
                }
              />
              <NumberField
                label="Max bank (s)"
                value={settings.maxBankSeconds}
                bounds={SETTINGS_BOUNDS.maxBankSeconds}
                onChange={(v) =>
                  setSettings((s) => ({ ...s, maxBankSeconds: v }))
                }
              />
              <NumberField
                label="Top-up on clue submit (s)"
                value={settings.cluePhaseSeconds}
                bounds={SETTINGS_BOUNDS.cluePhaseSeconds}
                onChange={(v) =>
                  setSettings((s) => ({ ...s, cluePhaseSeconds: v }))
                }
              />
              <NumberField
                label="Top-up per guess (s)"
                value={settings.guessPhaseSeconds}
                bounds={SETTINGS_BOUNDS.guessPhaseSeconds}
                onChange={(v) =>
                  setSettings((s) => ({ ...s, guessPhaseSeconds: v }))
                }
              />
              <NumberField
                label="Pool size"
                value={settings.poolSize}
                bounds={SETTINGS_BOUNDS.poolSize}
                onChange={(v) => setSettings((s) => ({ ...s, poolSize: v }))}
              />
              <NumberField
                label="Points per player (target)"
                value={settings.pointsPerPlayer}
                bounds={SETTINGS_BOUNDS.pointsPerPlayer}
                onChange={(v) =>
                  setSettings((s) => ({ ...s, pointsPerPlayer: v }))
                }
              />
            </div>
          )}

          <button
            type="button"
            className="primary"
            disabled={!canCreate}
            onClick={handleCreate}
          >
            {busy ? "Creating…" : "Create game"}
          </button>
        </section>

        <section className="card">
          <h2>Join a game</h2>
          <label className="field">
            <span>Room code</span>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABC23"
              autoCapitalize="characters"
              autoCorrect="off"
              maxLength={8}
            />
          </label>
          <button
            type="button"
            className="primary"
            disabled={!canJoin}
            onClick={handleJoin}
          >
            Join
          </button>
        </section>

        {error && <p className="error">{error}</p>}
      </main>
    </div>
  );
}

function NumberField({
  label,
  value,
  bounds,
  onChange,
}: {
  label: string;
  value: number;
  bounds: { min: number; max: number };
  onChange: (v: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={bounds.min}
        max={bounds.max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </label>
  );
}
