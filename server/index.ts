import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import { Server } from "socket.io";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.use(express.static(distDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

io.on("connection", (socket) => {
  console.log(`socket connected: ${socket.id}`);

  socket.on("disconnect", (reason) => {
    console.log(`socket disconnected: ${socket.id} (${reason})`);
  });
});

const PORT = Number(process.env.PORT ?? 3000);
httpServer.listen(PORT, () => {
  console.log(`Modesty server listening on http://localhost:${PORT}`);
});
