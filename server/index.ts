import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import { Server, type Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../shared/types.ts";
import {
  attachSocket,
  cleanName,
  createRoom,
  detachSocket,
  getRoom,
  getRoomBySocketId,
  joinRoom,
  nextRound,
  setSettings,
  startGame,
  submitClue,
  submitGuess,
  sweepStaleRooms,
  viewFor,
  type Player,
  type Room,
} from "./rooms.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist");

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: true, credentials: true },
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.use(express.static(distDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

function broadcastState(room: Room): void {
  for (const p of room.players) {
    if (p.socketId) {
      io.to(p.socketId).emit("state", viewFor(room, p.id));
    }
  }
}

function sendStateTo(socketId: string, room: Room, playerId: string): void {
  io.to(socketId).emit("state", viewFor(room, playerId));
}

/** Per-IP create-room rate limit: max N rooms per IP per window.
 *  Cheap insurance against scripted abuse. */
const CREATE_LIMIT_WINDOW_MS = 15 * 60_000;
const CREATE_LIMIT_MAX = 5;
const recentCreates = new Map<string, number[]>();

function clientIp(socket: Socket): string {
  // Behind cloudflared: cf-connecting-ip is the real client. Behind a generic
  // reverse proxy: x-forwarded-for is a comma-separated list, first is client.
  const h = socket.handshake.headers;
  const cf = h["cf-connecting-ip"];
  if (typeof cf === "string" && cf.length > 0) return cf;
  const xff = h["x-forwarded-for"];
  const xffStr = Array.isArray(xff) ? xff[0] : xff;
  if (typeof xffStr === "string" && xffStr.length > 0) {
    return xffStr.split(",")[0].trim();
  }
  return socket.handshake.address;
}

/** Returns true if the create is allowed and records it. False = rate-limited. */
function allowCreate(ip: string): boolean {
  const now = Date.now();
  const arr = (recentCreates.get(ip) ?? []).filter(
    (t) => now - t < CREATE_LIMIT_WINDOW_MS,
  );
  if (arr.length >= CREATE_LIMIT_MAX) {
    recentCreates.set(ip, arr);
    return false;
  }
  arr.push(now);
  recentCreates.set(ip, arr);
  return true;
}

function pruneRateLimitMap(): void {
  const now = Date.now();
  for (const [ip, arr] of recentCreates.entries()) {
    const fresh = arr.filter((t) => now - t < CREATE_LIMIT_WINDOW_MS);
    if (fresh.length === 0) recentCreates.delete(ip);
    else recentCreates.set(ip, fresh);
  }
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ hostName, settings }, cb) => {
    try {
      if (!allowCreate(clientIp(socket))) {
        cb({
          ok: false,
          error: "Too many rooms created from this network. Try again in a few minutes.",
        });
        return;
      }
      const name = cleanName(hostName ?? "");
      const { room, player } = createRoom(name, settings);
      attachSocket(room, player, socket.id);
      cb({
        ok: true,
        roomCode: room.code,
        playerId: player.id,
        sessionToken: player.sessionToken,
      });
      sendStateTo(socket.id, room, player.id);
    } catch (err) {
      cb({ ok: false, error: errMsg(err) });
    }
  });

  socket.on("room:join", ({ roomCode, name, sessionToken }, cb) => {
    try {
      const { room, player } = joinRoom(roomCode, name, sessionToken, socket.id);
      attachSocket(room, player, socket.id);
      cb({
        ok: true,
        roomCode: room.code,
        playerId: player.id,
        sessionToken: player.sessionToken,
      });
      broadcastState(room);
    } catch (err) {
      cb({ ok: false, error: errMsg(err) });
    }
  });

  socket.on("room:settings", ({ settings }, cb) => {
    try {
      const ctx = mustContext(socket.id);
      setSettings(ctx.room, ctx.player, settings);
      cb({ ok: true });
      broadcastState(ctx.room);
    } catch (err) {
      cb({ ok: false, error: errMsg(err) });
    }
  });

  socket.on("room:start", (cb) => {
    try {
      const ctx = mustContext(socket.id);
      startGame(ctx.room, ctx.player);
      cb({ ok: true });
      broadcastState(ctx.room);
    } catch (err) {
      cb({ ok: false, error: errMsg(err) });
    }
  });

  socket.on("clue:submit", ({ word, intended }, cb) => {
    try {
      const ctx = mustContext(socket.id);
      submitClue(ctx.room, ctx.player, word, intended);
      cb({ ok: true });
      broadcastState(ctx.room);
    } catch (err) {
      cb({ ok: false, error: errMsg(err) });
    }
  });

  socket.on("guess:submit", ({ targetId, picks }, cb) => {
    try {
      const ctx = mustContext(socket.id);
      submitGuess(ctx.room, ctx.player, targetId, picks);
      cb({ ok: true });
      broadcastState(ctx.room);
    } catch (err) {
      cb({ ok: false, error: errMsg(err) });
    }
  });

  socket.on("round:next", (cb) => {
    try {
      const ctx = mustContext(socket.id);
      nextRound(ctx.room, ctx.player);
      cb({ ok: true });
      broadcastState(ctx.room);
    } catch (err) {
      cb({ ok: false, error: errMsg(err) });
    }
  });

  socket.on("disconnect", () => {
    const room = detachSocket(socket.id);
    if (room) broadcastState(room);
  });
});

function mustContext(socketId: string): { room: Room; player: Player } {
  const ctx = getRoomBySocketId(socketId);
  if (!ctx) throw new Error("Not in a room");
  return ctx;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

const PORT = Number(process.env.PORT ?? 3000);
httpServer.listen(PORT, () => {
  console.log(`Modesty server listening on http://localhost:${PORT}`);
});

// Periodic background sweep: drop rooms that have gone idle, and trim the
// per-IP rate-limit map so it doesn't grow forever.
const SWEEP_INTERVAL_MS = 60_000;
setInterval(() => {
  const { deletedRooms, evictedSocketIds } = sweepStaleRooms();
  if (deletedRooms.length > 0) {
    console.log(
      `[sweep] removed ${deletedRooms.length} idle room(s): ${deletedRooms.join(", ")}`,
    );
    for (const sid of evictedSocketIds) {
      io.to(sid).emit("error", "Room was idle and has been closed.");
      io.sockets.sockets.get(sid)?.disconnect(true);
    }
  }
  pruneRateLimitMap();
}, SWEEP_INTERVAL_MS);

// Suppress unused-import warnings (getRoom is part of the rooms API surface).
void getRoom;
