import { useEffect, useRef, useState } from "react";
import type { PublicState } from "../../../shared/types";
import { getSocket } from "../socket";
import {
  clearSessionToken,
  loadName,
  loadSessionToken,
  saveName,
  saveSessionToken,
} from "../session";
import { Lobby } from "../components/Lobby";

type JoinStatus =
  | { kind: "needName" }
  | { kind: "joining" }
  | { kind: "joined" }
  | { kind: "error"; message: string };

export function Room({
  code,
  navigate,
}: {
  code: string;
  navigate: (path: string) => void;
}) {
  const [state, setState] = useState<PublicState | null>(null);
  const [name, setName] = useState(loadName());
  const initialToken = loadSessionToken(code);
  const [status, setStatus] = useState<JoinStatus>(
    initialToken ? { kind: "joining" } : { kind: "needName" },
  );
  const joinedRef = useRef(false);

  useEffect(() => {
    const socket = getSocket();
    const handleState = (s: PublicState) => setState(s);
    socket.on("state", handleState);

    function attemptJoin(opts: { name?: string; sessionToken?: string }) {
      setStatus({ kind: "joining" });
      socket.emit(
        "room:join",
        { roomCode: code, ...opts },
        (ack) => {
          if (!ack.ok) {
            if (opts.sessionToken) {
              clearSessionToken(code);
            }
            setStatus({ kind: "error", message: ack.error });
            return;
          }
          saveSessionToken(ack.roomCode, ack.sessionToken);
          joinedRef.current = true;
          setStatus({ kind: "joined" });
        },
      );
    }

    function maybeAutoJoin() {
      if (joinedRef.current) {
        // re-attach with the saved token
        const token = loadSessionToken(code);
        if (token) attemptJoin({ sessionToken: token });
        return;
      }
      const token = loadSessionToken(code);
      if (token) attemptJoin({ sessionToken: token });
    }

    if (socket.connected) {
      maybeAutoJoin();
    }
    socket.on("connect", maybeAutoJoin);

    return () => {
      socket.off("state", handleState);
      socket.off("connect", maybeAutoJoin);
    };
  }, [code]);

  function submitName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    saveName(trimmed);
    setStatus({ kind: "joining" });
    const socket = getSocket();
    socket.emit("room:join", { roomCode: code, name: trimmed }, (ack) => {
      if (!ack.ok) {
        setStatus({ kind: "error", message: ack.error });
        return;
      }
      saveSessionToken(ack.roomCode, ack.sessionToken);
      joinedRef.current = true;
      setStatus({ kind: "joined" });
    });
  }

  if (status.kind === "needName" || status.kind === "error") {
    return (
      <div className="app">
        <header className="header">
          <h1>Modesty is the Name</h1>
          <p className="tagline">Joining room {code}</p>
        </header>
        <main className="main">
          <form className="card" onSubmit={submitName}>
            <h2>What's your name?</h2>
            <label className="field">
              <span>Your name</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex"
                maxLength={20}
              />
            </label>
            <button
              type="submit"
              className="primary"
              disabled={!name.trim()}
            >
              Join {code}
            </button>
            {status.kind === "error" && (
              <p className="error">{status.message}</p>
            )}
            <button
              type="button"
              className="link"
              onClick={() => navigate("/")}
            >
              Back to home
            </button>
          </form>
        </main>
      </div>
    );
  }

  if (status.kind === "joining" || !state) {
    return (
      <div className="app">
        <header className="header">
          <h1>Modesty is the Name</h1>
        </header>
        <main className="main">
          <p>Connecting to room {code}…</p>
        </main>
      </div>
    );
  }

  return <RoomView state={state} />;
}

function RoomView({ state }: { state: PublicState }) {
  if (state.phase === "lobby") {
    return <Lobby state={state} />;
  }
  // Other phases land here as we build them.
  return (
    <div className="app">
      <header className="header">
        <h1>Modesty is the Name</h1>
        <p className="tagline">Room {state.roomCode}</p>
      </header>
      <main className="main">
        <p>Phase: {state.phase} (UI for this phase isn't built yet).</p>
      </main>
    </div>
  );
}
