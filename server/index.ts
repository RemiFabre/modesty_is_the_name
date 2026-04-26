import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import { Server } from "socket.io";
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

io.on("connection", (socket) => {
  socket.on("room:create", ({ hostName, settings }, cb) => {
    try {
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

// Suppress unused-import warnings (getRoom is part of the rooms API surface).
void getRoom;
