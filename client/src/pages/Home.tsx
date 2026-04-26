import { useState } from "react";
import {
  AXIS_LABEL_MAX_LEN,
  DEFAULT_SETTINGS,
  LANGUAGE_NAMES,
  LANGUAGES,
  PROFILE_AXES_MAX,
  PROFILE_AXES_MIN,
  PROFILE_PRESETS,
  SCORING_MODE_INFO,
  SCORING_MODES,
  SETTINGS_BOUNDS,
  type AxisPair,
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
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_NAMES[l]}
                </option>
              ))}
            </select>
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

          <ProfileAxesEditor
            axes={settings.profileAxes}
            onChange={(profileAxes) =>
              setSettings((s) => ({ ...s, profileAxes }))
            }
          />

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
              <NumberField
                label="Solve bonus"
                value={settings.solveBonus}
                bounds={SETTINGS_BOUNDS.solveBonus}
                onChange={(v) => setSettings((s) => ({ ...s, solveBonus: v }))}
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

function ProfileAxesEditor({
  axes,
  onChange,
}: {
  axes: AxisPair[];
  onChange: (next: AxisPair[]) => void;
}) {
  function setPreset(id: string) {
    if (id === "custom") return; // keep current axes
    const preset = PROFILE_PRESETS.find((p) => p.id === id);
    if (preset) onChange(preset.axes.map((a) => ({ ...a })));
  }

  // Detect which preset (if any) currently matches.
  const currentPresetId =
    PROFILE_PRESETS.find(
      (p) =>
        p.axes.length === axes.length &&
        p.axes.every(
          (a, i) =>
            a.left === axes[i]?.left && a.right === axes[i]?.right,
        ),
    )?.id ?? "custom";

  function updateAxis(i: number, patch: Partial<AxisPair>) {
    onChange(
      axes.map((a, idx) =>
        idx === i ? { left: patch.left ?? a.left, right: patch.right ?? a.right } : a,
      ),
    );
  }
  function addAxis() {
    if (axes.length >= PROFILE_AXES_MAX) return;
    onChange([...axes, { left: "Low", right: "High" }]);
  }
  function removeAxis(i: number) {
    if (axes.length <= PROFILE_AXES_MIN) return;
    onChange(axes.filter((_, idx) => idx !== i));
  }

  return (
    <div className="field">
      <span>Profile axes</span>
      <select
        value={currentPresetId}
        onChange={(e) => setPreset(e.target.value)}
      >
        {PROFILE_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} ({p.axes.length} axes)
          </option>
        ))}
        <option value="custom">Custom</option>
      </select>
      <div className="axes-editor">
        {axes.map((a, i) => (
          <div key={i} className="axis-edit-row">
            <input
              value={a.left}
              maxLength={AXIS_LABEL_MAX_LEN}
              onChange={(e) => updateAxis(i, { left: e.target.value })}
              placeholder="Left"
            />
            <span className="axis-edit-sep">↔</span>
            <input
              value={a.right}
              maxLength={AXIS_LABEL_MAX_LEN}
              onChange={(e) => updateAxis(i, { right: e.target.value })}
              placeholder="Right"
            />
            <button
              type="button"
              className="ghost axis-edit-rm"
              onClick={() => removeAxis(i)}
              disabled={axes.length <= PROFILE_AXES_MIN}
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="row">
        <button
          type="button"
          className="ghost"
          onClick={addAxis}
          disabled={axes.length >= PROFILE_AXES_MAX}
        >
          + Add axis
        </button>
        <span className="muted small">
          {axes.length} / {PROFILE_AXES_MAX} (min {PROFILE_AXES_MIN})
        </span>
      </div>
    </div>
  );
}
