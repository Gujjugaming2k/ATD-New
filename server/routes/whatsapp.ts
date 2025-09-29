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

async function tryJson(target: string, payload: any) {
  const resp = await fetch(target, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, body: json } as const;
}

async function tryMultipartWithUrl(target: string, payload: any, fileUrl: string) {
  const form = new FormData();
  form.append("appkey", String(payload.appkey));
  form.append("authkey", String(payload.authkey));
  form.append("to", String(payload.to));
  form.append("message", String(payload.message));
  if (payload.template_id) form.append("template_id", String(payload.template_id));
  // Some providers accept file URL in a field instead of binary
  form.append("file_url", String(fileUrl));
  const resp = await fetch(target, { method: "POST", body: form as any });
  const text = await resp.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, body: json } as const;
}

async function tryMultipartWithBinary(target: string, payload: any, buffer: Buffer, mime = "image/png", filename = "attendance.png") {
  const u8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const blob = new Blob([u8], { type: mime });
  const form = new FormData();
  form.append("appkey", String(payload.appkey));
  form.append("authkey", String(payload.authkey));
  form.append("to", String(payload.to));
  form.append("message", String(payload.message));
  if (payload.template_id) form.append("template_id", String(payload.template_id));
  form.append("file", blob, filename);
  const resp = await fetch(target, { method: "POST", body: form as any });
  const text = await resp.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, body: json } as const;
}

whatsappRouter.post("/send", upload.single("file"), async (req, res) => {
  try {
    const { endpoint, appkey, authkey, to, message, imageDataUrl } = req.body || {};
    if (!endpoint || !appkey || !authkey || !to || !message) {
      return res.status(400).json({ error: "Missing endpoint/appkey/authkey/to/message" });
    }

    let buffer: Buffer | null = null;
    let originalName = "attendance.png";
    let mime: string | undefined = undefined;

    if (req.file && req.file.buffer) {
      buffer = Buffer.from(req.file.buffer.buffer, req.file.buffer.byteOffset, req.file.buffer.byteLength);
      originalName = req.file.originalname || originalName;
      mime = req.file.mimetype || "image/png";
    } else if (imageDataUrl) {
      const d = dataUrlToBuffer(String(imageDataUrl));
      buffer = d.buffer;
      mime = d.mime;
    }

    // If we have an image, host it and send its URL; otherwise send text-only
    let fileUrl: string | undefined = undefined;
    if (buffer) {
      const filename = saveBufferToUploads(buffer, originalName);
      fileUrl = `${getOrigin(req)}/uploads/${encodeURIComponent(filename)}`;
    }

    const basePayload: any = {
      appkey,
      authkey,
      to,
      message,
    };
    if ((req.body as any)?.template_id) basePayload.template_id = String((req.body as any).template_id);

    // 1) Try JSON: with file_url when available, else text-only
    const jsonPayload = fileUrl ? { ...basePayload, file_url: fileUrl } : { ...basePayload };
    let result = await tryJson(String(endpoint), jsonPayload);

    // 2) If failed and we had file URL, try multipart with URL field
    if (!result.ok && fileUrl) {
      result = await tryMultipartWithUrl(String(endpoint), basePayload, fileUrl);
    }

    // 3) If still failed and we have the binary buffer, try multipart with real file
    if (!result.ok && buffer) {
      result = await tryMultipartWithBinary(String(endpoint), basePayload, buffer, mime, originalName);
    }

    // 4) As last resort, try pure text-only JSON (some providers reject when file provided)
    if (!result.ok && fileUrl) {
      result = await tryJson(String(endpoint), { ...basePayload });
    }

    if (!result.ok) {
      return res.status(result.status || 502).json({ error: "Remote API error", response: result.body });
    }

    res.json({ ok: true, response: result.body });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to send WhatsApp", detail: e?.message || String(e) });
  }
});
