import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { handleDemo } from "./routes/demo";
import { filesRouter } from "./routes/files";
import { attendanceRouter } from "./routes/attendance";

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

  // Optional: serve uploaded files statically (read-only)
  app.use(
    "/uploads",
    express.static(path.resolve(process.cwd(), "server", "uploads")),
  );

  return app;
}
