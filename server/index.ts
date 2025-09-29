import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { handleDemo } from "./routes/demo";
import { filesRouter } from "./routes/files";
import { attendanceRouter } from "./routes/attendance";
import { whatsappRouter } from "./routes/whatsapp";

const UPLOAD_DIR = path.resolve(process.cwd(), "server", "uploads");
const MEDIA_SIGN_KEY = process.env.MEDIA_SIGN_KEY || "dev-secret";

function signMedia(filename: string, exp: string) {
  return crypto.createHmac("sha256", MEDIA_SIGN_KEY).update(`${filename}:${exp}`).digest("hex");
}

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health/demo routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });
  app.get("/api/demo", handleDemo);

  // Files management
  app.use("/api/files", filesRouter);
  // Attendance APIs
  app.use("/api/attendance", attendanceRouter);
  // WhatsApp APIs
  app.use("/api/whatsapp", whatsappRouter);

  // Serve uploaded files statically (read-only)
  app.use("/uploads", express.static(UPLOAD_DIR));

  // Signed, temporary URL for uploads: /uploads-temp/:filename?exp=unix_ms&sig=HMAC
  app.get("/uploads-temp/:filename", (req, res) => {
    const { filename } = req.params as { filename: string };
    const { exp, sig } = req.query as { exp?: string; sig?: string };
    if (!exp || !sig) return res.status(400).json({ error: "Missing exp/sig" });

    const now = Date.now();
    const expNum = Number(exp);
    if (!Number.isFinite(expNum)) return res.status(400).json({ error: "Invalid exp" });
    if (now > expNum) return res.status(410).json({ error: "Link expired" });

    const expected = signMedia(filename, String(exp));
    if (sig !== expected) return res.status(403).json({ error: "Invalid signature" });

    const filePath = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });

    res.sendFile(filePath);
  });

  return app;
}
