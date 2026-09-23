import config from "./config.ts";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import express, { type Response } from "express";
import bodyParser from "body-parser";
import compression from "compression";
import cors from "cors";
import { Server } from "socket.io";
import { Room } from "./room.ts";
import { makeRoomName, makeUserName } from "./utils/moniker.ts";

const app = express();

let server: https.Server | http.Server;
if (
  config.SSL_KEY_FILE &&
  config.SSL_CRT_FILE &&
  fs.existsSync(config.SSL_KEY_FILE) &&
  fs.existsSync(config.SSL_CRT_FILE)
) {
  const key = fs.readFileSync(config.SSL_KEY_FILE);
  const cert = fs.readFileSync(config.SSL_CRT_FILE);
  server = https.createServer({ key, cert }, app);
} else {
  server = new http.Server(app);
}

const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
});

const rooms = new Map<string, Room>();

// Helper to get or dynamically instantiate an in-memory room
export function getOrCreateRoom(rawRoomId: string): Room {
  const key = rawRoomId.startsWith("/") ? rawRoomId : "/" + rawRoomId;
  let room = rooms.get(key);
  if (!room) {
    room = new Room(io, key);
    rooms.set(key, room);
    console.log(`[ROOM] Created in-memory room: ${key}`);
  }
  return room;
}

// Ensure target room namespace is initialized before socket handshake completes
io.engine.use((req: any, _res: Response, next: () => void) => {
  try {
    const rawUrl = req.url || "";
    const parsedUrl = new URL(rawUrl, "http://localhost");
    const roomId = parsedUrl.searchParams.get("roomId") || req._query?.roomId;
    if (roomId && typeof roomId === "string") {
      getOrCreateRoom(roomId);
    }
  } catch (e) {
    // ignore parsing errors
  }
  next();
});

// Periodic cleanup of idle empty rooms (after 2 hours of inactivity)
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, room] of rooms.entries()) {
    if (
      room.roster.length === 0 &&
      now - room.lastUpdateTime.getTime() > IDLE_TIMEOUT_MS
    ) {
      console.log(`[CLEANUP] Releasing idle empty room ${key}`);
      room.destroy();
      rooms.delete(key);
      io._nsps.delete(key);
    }
  }
}, 5 * 60 * 1000);

app.use(cors());
app.use(bodyParser.json());
app.use(compression());

// Health & Status
app.get("/ping", (_req, res) => {
  res.json("pong");
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    activeRooms: rooms.size,
    uptime: process.uptime(),
  });
});

// Moniker generator for random usernames
app.get("/generateName", (_req, res) => {
  res.send(makeUserName());
});

// Room Creation
app.post("/createRoom", (_req, res) => {
  const rawName = makeRoomName();
  const name = "/" + rawName;
  getOrCreateRoom(name);
  console.log(`[ROOM] Created new room via API: ${name}`);
  res.json({ name });
});

// Compatibility endpoints for clean client integration
app.get("/metadata", (_req, res) => {
  res.json({
    isSubscriber: true,
    isFreePoolFull: false,
    beta: false,
  });
});

app.get("/resolveRoom/:vanity", (_req, res) => {
  res.json(null);
});

// Helper to validate admin bearer tokens
export function isValidAdminToken(token: string): boolean {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    return decoded.startsWith(`admin:${config.ADMIN_PASSWORD}:`);
  } catch {
    return false;
  }
}

// Admin Authentication API
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body || {};
  if (password && password === config.ADMIN_PASSWORD) {
    const token = Buffer.from(`admin:${config.ADMIN_PASSWORD}:${Date.now()}`).toString("base64");
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: "Invalid admin password" });
  }
});

// Admin Verify Token API
app.get("/api/admin/verify", (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (isValidAdminToken(token)) {
    res.json({ valid: true });
  } else {
    res.status(401).json({ valid: false });
  }
});

// Admin Room Management API
app.get("/api/admin/rooms", (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!isValidAdminToken(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const activeRooms = Array.from(rooms.entries()).map(([name, room]) => ({
    name: name.replace(/^\//, ""),
    viewers: room.roster.length,
    isStreaming: Boolean(room.video?.startsWith("screenshare://")),
    lastUpdated: room.lastUpdateTime,
  }));
  res.json({ rooms: activeRooms });
});

// Static client bundle serving
const buildPath = path.resolve(process.cwd(), config.BUILD_DIRECTORY);
app.use(express.static(buildPath));

// SPA fallback
app.use("/*splat", (_req, res) => {
  const indexHtml = path.resolve(buildPath, "index.html");
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res
      .status(404)
      .send("Frontend build not found. Please build the client bundle.");
  }
});

server.listen(Number(config.PORT), config.HOST, () => {
  console.log(
    `[SERVER] Screen & Voice streaming server listening on ${config.HOST}:${config.PORT}`,
  );
});
