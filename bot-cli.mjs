#!/usr/bin/env node
// Modesty bot CLI — one shell command per game action.
// Usage: see AGENTS.md.

import { io } from "socket.io-client";

const HARD_TIMEOUT_MS = 20_000;
setTimeout(() => {
  console.error(JSON.stringify({ error: "hard-timeout" }));
  process.exit(2);
}, HARD_TIMEOUT_MS);

const args = {};
let cmd = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) {
    const eq = a.indexOf("=");
    if (eq > 0) {
      args[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      args[a.slice(2)] = process.argv[++i];
    }
  } else if (cmd === null) {
    cmd = a;
  }
}

const url = args.url || process.env.MODESTY_URL;
const room = args.room || process.env.MODESTY_ROOM;
const token = args.token || process.env.MODESTY_TOKEN;

function die(payload) {
  const out =
    typeof payload === "string"
      ? { error: payload }
      : payload;
  console.error(JSON.stringify(out));
  process.exit(1);
}

async function emit(sock, event, payload) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("timeout " + event)), 8000);
    const cb = (a) => {
      clearTimeout(t);
      res(a);
    };
    if (payload === undefined) sock.emit(event, cb);
    else sock.emit(event, payload, cb);
  });
}

async function connect() {
  if (!url) die("--url required (or MODESTY_URL env var)");
  const sock = io(url, { transports: ["websocket"], forceNew: true });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("connect timeout")), 5000);
    sock.once("connect", () => {
      clearTimeout(t);
      res();
    });
    sock.once("connect_error", (e) => {
      clearTimeout(t);
      rej(e);
    });
  });
  return sock;
}

async function joinRoom(sock, payload) {
  let lastState = null;
  sock.on("state", (s) => {
    lastState = s;
  });
  const ack = await emit(sock, "room:join", payload);
  if (!ack.ok) {
    sock.disconnect();
    die({ error: ack.error });
  }
  // Wait briefly for the post-join state broadcast.
  await new Promise((r) => setTimeout(r, 250));
  return { ack, state: lastState };
}

function parseList(raw) {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Project a dotted path into an object: "a.b.0.c" → obj.a.b[0].c. Returns undefined if any segment is missing. */
function projectPath(obj, path) {
  if (!path) return obj;
  const segs = path.split(".").filter(Boolean);
  let cur = obj;
  for (const s of segs) {
    if (cur == null) return undefined;
    cur = cur[s];
  }
  return cur;
}

/** Wrap a console.log call so the caller can request a sub-field via --field PATH or --fields A,B,C. */
function emitJSON(payload) {
  if (args.fields) {
    const out = {};
    for (const path of args.fields.split(",").map((s) => s.trim()).filter(Boolean)) {
      const sub = projectPath(payload, path);
      out[path] = sub === undefined ? null : sub;
    }
    console.log(JSON.stringify(out));
  } else if (args.field) {
    const sub = projectPath(payload, args.field);
    console.log(JSON.stringify(sub === undefined ? null : sub));
  } else {
    console.log(JSON.stringify(payload));
  }
}

async function main() {
  if (!cmd) die("usage: bot-cli.mjs <join|status|clue|guess|next|start> ...");

  if (cmd === "help") {
    console.log(
      [
        "modesty bot-cli — one-shot commands for an LLM agent",
        "",
        "Common flags: --url URL --room CODE",
        "Most commands need --token TOKEN (returned by `join` or `create`).",
        "",
        "Commands:",
        "  create --url URL --name NAME [--languages en,fr,es] \\",
        "         [--scoring symmetric|generous|precision] [--profile-mode binary|gradient] \\",
        "         [--points-per-player 18] [--pool-size 20] [--accuracy-bonus 2] \\",
        "         [--public-figures false] [--polyglot-bonus true] \\",
        "         [--axes-json '[{\"left\":\"...\",\"right\":\"...\"}, ...]']",
        "         → prints {playerId, sessionToken, roomCode, state}.",
        "         The creator is the host.",
        "  join   --url URL --room CODE --name NAME",
        "         → prints {playerId, sessionToken, roomCode, state}",
        "  status --url URL --room CODE --token TOKEN",
        "         → prints {state}",
        "  start  --url URL --room CODE --token TOKEN          (host only)",
        "  clue   --url URL --room CODE --token TOKEN \\",
        "         --word WORD --intended w1,w2,w3",
        "  guess  --url URL --room CODE --token TOKEN \\",
        "         --target PLAYER_ID --picks w1,w2 --axes 1,2,3,4",
        "  next   --url URL --room CODE --token TOKEN          (host only)",
        "",
        "Env vars: MODESTY_URL / MODESTY_ROOM / MODESTY_TOKEN replace the flags.",
        "",
        "Add --field PATH to any command to print only a sub-value (dot-notation,",
        "  e.g. --field state.phase, --field state.me.owedAction,",
        "  --field state.round.pendingGuesses.0.clueWord).",
        "Or --fields A,B,C for batched: returns an object keyed by each path.",
        "",
        "All output is single-line JSON on stdout. Errors are JSON on stderr + exit 1.",
      ].join("\n"),
    );
    process.exit(0);
  }

  if (cmd === "create") {
    if (!args.name) die("--name required");
    const sock = await connect();
    let lastState = null;
    sock.on("state", (s) => {
      lastState = s;
    });
    const settings = {};
    if (args.languages) {
      settings.languages = args.languages
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (args.language) {
      settings.languages = [args.language];
    }
    if (args.scoring) settings.scoring = args.scoring;
    if (args["profile-mode"]) settings.profileMode = args["profile-mode"];
    if (args["points-per-player"]) {
      settings.pointsPerPlayer = parseInt(args["points-per-player"], 10);
    }
    if (args["pool-size"]) {
      settings.poolSize = parseInt(args["pool-size"], 10);
    }
    if (args["accuracy-bonus"]) {
      settings.publicAccuracyBonus = parseInt(args["accuracy-bonus"], 10);
    }
    if (args["public-figures"] !== undefined) {
      settings.publicFigures =
        args["public-figures"] !== "false" && args["public-figures"] !== "0";
    }
    if (args["polyglot-bonus"] !== undefined) {
      settings.polyglotBonus =
        args["polyglot-bonus"] !== "false" && args["polyglot-bonus"] !== "0";
    }
    if (args["axes-json"]) {
      try {
        settings.profileAxes = JSON.parse(args["axes-json"]);
      } catch (e) {
        sock.disconnect();
        die({ error: "invalid --axes-json: " + e.message });
      }
    }
    const ack = await emit(sock, "room:create", {
      hostName: args.name,
      settings,
    });
    if (!ack.ok) {
      sock.disconnect();
      die({ error: ack.error });
    }
    await new Promise((r) => setTimeout(r, 250));
    emitJSON({
      playerId: ack.playerId,
      sessionToken: ack.sessionToken,
      roomCode: ack.roomCode,
      state: lastState,
    });
    sock.disconnect();
    return;
  }

  if (cmd === "join") {
    if (!room) die("--room required");
    if (!args.name) die("--name required");
    const sock = await connect();
    const { ack, state } = await joinRoom(sock, {
      roomCode: room,
      name: args.name,
    });
    console.log(
      JSON.stringify({
        playerId: ack.playerId,
        sessionToken: ack.sessionToken,
        roomCode: ack.roomCode,
        state,
      }),
    );
    sock.disconnect();
    return;
  }

  if (!room) die("--room required");
  if (!token) die("--token required");

  const sock = await connect();
  const { state } = await joinRoom(sock, {
    roomCode: room,
    sessionToken: token,
  });

  switch (cmd) {
    case "status": {
      emitJSON({ state });
      break;
    }
    case "start": {
      const ack = await emit(sock, "room:start");
      emitJSON(ack);
      break;
    }
    case "clue": {
      if (!args.word) die("--word required");
      const intended = parseList(args.intended);
      const ack = await emit(sock, "clue:submit", {
        word: args.word,
        intended,
      });
      emitJSON(ack);
      break;
    }
    case "guess": {
      if (!args.target) die("--target required");
      const picks = parseList(args.picks);
      const axes = parseList(args.axes).map((s) => parseInt(s, 10));
      const ack = await emit(sock, "guess:submit", {
        targetId: args.target,
        picks,
        axes,
      });
      emitJSON(ack);
      break;
    }
    case "next": {
      const ack = await emit(sock, "round:next");
      emitJSON(ack);
      break;
    }
    default:
      sock.disconnect();
      die("unknown command: " + cmd);
  }

  sock.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((e) => die({ error: e.message ?? String(e) }));
