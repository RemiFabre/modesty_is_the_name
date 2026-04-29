import { useState } from "react";
import {
  DEFAULT_SETTINGS,
  LANGUAGE_NAMES,
  LANGUAGES,
  SCORING_MODE_INFO,
  SCORING_MODES,
  SETTINGS_BOUNDS,
  type RoomSettings,
} from "../../../shared/types";
import { getSocket } from "../socket";
import { loadName, saveName, saveSessionToken } from "../session";

export function Home({ onCreated }: { onCreated: (code: string) => void }) {
  const [name, setName] = useState(loadName());
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
      { hostName: trimmed, settings },
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
            <span>
              Languages{" "}
              <span className="muted small">
                ({settings.languages.length} selected, pool draws roughly
                equally from each)
              </span>
            </span>
            <div className="lang-grid">
              {LANGUAGES.map((l) => {
                const on = settings.languages.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
                    className={"lang-chip" + (on ? " lang-on" : "")}
                    onClick={() =>
                      setSettings((s) => {
                        const has = s.languages.includes(l);
                        if (has && s.languages.length === 1) return s; // keep at least one
                        return {
                          ...s,
                          languages: has
                            ? s.languages.filter((x) => x !== l)
                            : [...s.languages, l],
                        };
                      })
                    }
                  >
                    {LANGUAGE_NAMES[l]}
                  </button>
                );
              })}
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

          <ToggleField
            label="Polyglot cluster bonus"
            value={settings.polyglotBonus}
            onChange={(v) => setSettings((s) => ({ ...s, polyglotBonus: v }))}
            description={
              settings.languages.length < 2
                ? "Adds an extra reward, on top of the scoring above, when you guess every intended word and the matched picks span multiple languages. Group the matched words by language and award T(slice) for each 'horizontal slice' (one cluster of distinct-language words). Example: 3 EN + 2 FR + 1 ES → T(3)+T(2)+T(1) = 6+3+1 = +10. Symmetric to both sides. Inactive in single-language games, enable a second language above to use it."
                : "Adds an extra reward, on top of the scoring above, when you guess every intended word and the matched picks span multiple languages. Group the matched words by language and award T(slice) for each 'horizontal slice' (one cluster of distinct-language words). Example: 3 EN + 2 FR + 1 ES → T(3)+T(2)+T(1) = 6+3+1 = +10. Symmetric to both sides. Rewards finding tight clusters that span the most languages possible."
            }
          />

          <ToggleField
            label="Originality bonus"
            value={settings.originalityBonus}
            onChange={(v) =>
              setSettings((s) => ({ ...s, originalityBonus: v }))
            }
            description="When ON, each correctly-guessed word is weighted by how unique that pick was. If only the target cluer picked the word, it counts for full credit; if every cluer picked it, it counts for 0. Formula: U(w) = 1 - (c-1)/(N-1), where c = cluers who picked w and N = number of cluers. Discourages convergence on the obvious cluster (everyone clueing 'animals' on the same animal pool) and rewards lateral connections nobody else saw."
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

function ToggleField({
  label,
  value,
  onChange,
  description,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  description: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="seg">
        <button
          type="button"
          className={value ? "seg-on" : ""}
          onClick={() => onChange(true)}
        >
          On
        </button>
        <button
          type="button"
          className={!value ? "seg-on" : ""}
          onClick={() => onChange(false)}
        >
          Off
        </button>
      </div>
      <span className="muted small">{description}</span>
    </label>
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

