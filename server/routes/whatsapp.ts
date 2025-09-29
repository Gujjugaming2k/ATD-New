import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";

export const whatsappRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

const UPLOAD_DIR = path.resolve(process.cwd(), "server", "uploads");

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function timestampedName(originalName: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safe = sanitizeFilename(originalName || "attendance.png");
  return `${ts}__${safe}`;
}

function saveBufferToUploads(buffer: Buffer, originalName = "attendance.png") {
  ensureUploadDir();
  const filename = timestampedName(originalName);
  const full = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(full, buffer);
  return filename;
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mime: string } {
  const [meta, base64] = (dataUrl || "").split(",");
  const mimeMatch = /data:([^;]+);base64/.exec(meta || "");
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const buffer = Buffer.from(base64 || "", "base64");
  return { buffer, mime };
}

function getOrigin(req: any) {
  const xfProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0];
  const xfHost = String(req.headers["x-forwarded-host"] || "").split(",")[0];
  const protocol = xfProto || req.protocol || "http";
  const host = xfHost || req.get("host");
  return `${protocol}://${host}`;
}

whatsappRouter.post("/send", upload.single("file"), async (req, res) => {
  try {
    const { endpoint, appkey, authkey, to, message, imageDataUrl } = req.body || {};
    if (!endpoint || !appkey || !authkey || !to || !message) {
      return res
        .status(400)
        .json({ error: "Missing endpoint/appkey/authkey/to/message" });
    }

    // Build an image buffer from either uploaded file or data URL
    let buffer: Buffer | null = null;
    let originalName = "attendance.png";

    if (req.file && req.file.buffer) {
      buffer = Buffer.from(
        req.file.buffer.buffer,
        req.file.buffer.byteOffset,
        req.file.buffer.byteLength,
      );
      originalName = req.file.originalname || originalName;
    } else if (imageDataUrl) {
      const d = dataUrlToBuffer(String(imageDataUrl));
      buffer = d.buffer;
      // keep default originalName; mime is not required for URL mode
    } else {
      return res.status(400).json({ error: "Missing file or imageDataUrl" });
    }

    // Save image locally and generate a public URL to satisfy providers that require URLs
    const filename = saveBufferToUploads(buffer!, originalName);
    const fileUrl = `${getOrigin(req)}/uploads/${encodeURIComponent(filename)}`;

    const form = new FormData();
    form.append("appkey", String(appkey));
    form.append("authkey", String(authkey));
    form.append("to", String(to));
    form.append("message", String(message));
    if ((req.body as any)?.template_id)
      form.append("template_id", String((req.body as any).template_id));

    // Send as URL instead of binary file
    form.append("file", fileUrl);

    const target = String(endpoint);
    const resp = await fetch(target, {
      method: "POST",
      body: form as any,
    });

    const text = await resp.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (!resp.ok) {
      return res.status(resp.status).json({ error: "Remote API error", response: json });
    }

    res.json({ ok: true, response: json });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to send WhatsApp", detail: e?.message || String(e) });
  }
});
