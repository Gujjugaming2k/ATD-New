import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export const whatsappRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

const TEMP_UPLOAD_DIR = path.resolve(process.cwd(), "server", "uploads_tmp");
const MEDIA_SIGN_KEY = process.env.MEDIA_SIGN_KEY || "dev-secret";
const MEDIA_TTL_MS = Number(process.env.MEDIA_URL_TTL_MS || 5 * 60 * 1000);
const MEDIA_PUBLIC_BASE = process.env.MEDIA_PUBLIC_BASE || ""; // e.g. https://your-domain.com

// Server-side config persistence
const CONFIG_DIR = path.resolve(process.cwd(), "server", "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "whatsapp.json");

type StoredConfig = {
  endpoint: string;
  appkey: string;
  authkey: string;
  templateId?: string;
  imageHost?: string;
};

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function readStoredConfig(): StoredConfig | null {
  try {
    ensureConfigDir();
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      endpoint: String(parsed.endpoint || ""),
      appkey: String(parsed.appkey || ""),
      authkey: String(parsed.authkey || ""),
      templateId: parsed.templateId ? String(parsed.templateId) : undefined,
      imageHost: parsed.imageHost ? String(parsed.imageHost) : undefined,
    };
  } catch {
    return null;
  }
}

function writeStoredConfig(cfg: StoredConfig) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
}

function requireIfSetAuthorized(req: any): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return true; // if not configured, allow for now
  const header = String(req.headers["x-admin-token"] || "").trim();
  return header === token;
}

function ensureTempDir() {
  if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
    fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
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

function saveBufferToTemp(buffer: Buffer, originalName = "attendance.png") {
  ensureTempDir();
  const filename = timestampedName(originalName);
  const full = path.join(TEMP_UPLOAD_DIR, filename);
  fs.writeFileSync(full, buffer);
  return filename;
}

function randomId(len = 8) {
  return crypto.randomBytes(len).toString("base64url").slice(0, len);
}

function saveBufferToShort(
  buffer: Buffer,
  opts?: { mime?: string; originalName?: string },
) {
  ensureTempDir();
  const ext = (opts?.mime || "image/png").split("/")[1] || "png";
  const id = randomId(8);
  const filename = `${Date.now()}-${id}.${ext}`;
  const full = path.join(TEMP_UPLOAD_DIR, filename);
  fs.writeFileSync(full, buffer);
  return { id, filename, ext };
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

function getPublicBase(req: any) {
  const base = MEDIA_PUBLIC_BASE.trim();
  if (base) return base.replace(/\/$/, "");
  return getOrigin(req);
}

function signMedia(filename: string, exp: string) {
  return crypto
    .createHmac("sha256", MEDIA_SIGN_KEY)
    .update(`${filename}:${exp}`)
    .digest("hex");
}

async function postJson(target: string, payload: any) {
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

async function postFormUrlEncoded(
  target: string,
  payload: Record<string, string>,
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) params.append(k, v);
  const resp = await fetch(target, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
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

// Get stored WhatsApp config
whatsappRouter.get("/config", (req, res) => {
  if (!requireIfSetAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
  const cfg = readStoredConfig();
  res.json(
    cfg || {
      endpoint: "",
      appkey: "",
      authkey: "",
      templateId: "",
      imageHost: "",
    },
  );
});

// Save WhatsApp config
whatsappRouter.put("/config", (req, res) => {
  if (!requireIfSetAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
  const b = req.body || {};
  const cfg: StoredConfig = {
    endpoint: String(b.endpoint || ""),
    appkey: String(b.appkey || ""),
    authkey: String(b.authkey || ""),
    templateId: b.templateId ? String(b.templateId) : undefined,
    imageHost: b.imageHost ? String(b.imageHost) : undefined,
  };
  if (!cfg.endpoint || !cfg.appkey || !cfg.authkey) {
    return res.status(400).json({ error: "endpoint, appkey, authkey are required" });
  }
  try {
    writeStoredConfig(cfg);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to save config", detail: e?.message || String(e) });
  }
});

// New: create a temporary, signed public URL from a data URL (JSON payload)
whatsappRouter.post("/image-url", async (req, res) => {
  try {
    const originalName = (req.body?.name as string) || "attendance.png";
    const imageDataUrl = String(req.body?.imageDataUrl || "");
    if (!imageDataUrl.startsWith("data:")) {
      return res.status(400).json({ error: "imageDataUrl is required" });
    }
    const d = dataUrlToBuffer(imageDataUrl);
    const { id, ext } = saveBufferToShort(d.buffer, {
      mime: d.mime,
      originalName,
    });
    let base = getPublicBase(req);
    const requested = String(req.body?.publicBase || "").trim();
    if (requested) {
      try {
        const u = new URL(requested);
        if (u.protocol === "http:" || u.protocol === "https:") base = u.origin;
      } catch {}
    }
    const url = `${base}/i/${id}.${ext}`;
    res.json({ url });
  } catch (e: any) {
    res
      .status(500)
      .json({
        error: "Failed to create image URL",
        detail: e?.message || String(e),
      });
  }
});

function formatTo91(raw: any) {
  const digits = String(raw || "").replace(/\D+/g, "");
  if (!digits) return "";
  const last10 = digits.slice(-10);
  return `91${last10}`;
}

// Send WhatsApp using provider that expects a URL-only 'file' parameter
whatsappRouter.post("/send", upload.none(), async (req, res) => {
  try {
    let { endpoint, appkey, authkey, to, message } = req.body || {} as any;

    // fallback to server-stored config if not provided in request
    if (!endpoint || !appkey || !authkey) {
      const stored = readStoredConfig();
      if (stored) {
        endpoint = endpoint || stored.endpoint;
        appkey = appkey || stored.appkey;
        authkey = authkey || stored.authkey;
        if (!req.body?.template_id && stored.templateId) {
          (req.body as any).template_id = stored.templateId;
        }
      }
    }

    if (!endpoint || !appkey || !authkey || !to || !message) {
      return res
        .status(400)
        .json({ error: "Missing endpoint/appkey/authkey/to/message" });
    }

    // Use provided fileUrl if given; otherwise allow legacy image inputs to generate a temp URL
    let tempUrl: string | undefined = undefined;
    const reqFileUrl = String((req.body as any)?.fileUrl || "").trim();
    if (reqFileUrl && /^https?:\/\//i.test(reqFileUrl)) {
      tempUrl = reqFileUrl;
    } else {
      let buffer: Buffer | null = null;
      let originalName = "attendance.png";

      if (req.file && req.file.buffer) {
        buffer = Buffer.from(
          req.file.buffer.buffer,
          req.file.buffer.byteOffset,
          req.file.buffer.byteLength,
        );
        originalName = req.file.originalname || originalName;
      } else if ((req.body as any)?.imageDataUrl) {
        const d = dataUrlToBuffer(String((req.body as any).imageDataUrl));
        buffer = d.buffer;
      }

      if (buffer) {
        const { id, ext } = saveBufferToShort(buffer, { originalName });
        const base = getPublicBase(req);
        tempUrl = `${base}/i/${id}.${ext}`;
      }
    }

    // allow overriding public base from stored config
    const stored = readStoredConfig();
    let effectivePublicBase: string | undefined = undefined;
    if (stored?.imageHost) {
      try {
        const u = new URL(stored.imageHost);
        if (u.protocol === "http:" || u.protocol === "https:") {
          effectivePublicBase = u.origin;
        }
      } catch {}
    }
    if (effectivePublicBase && tempUrl) {
      try {
        const tempU = new URL(tempUrl);
        tempUrl = `${effectivePublicBase}${tempU.pathname}`;
      } catch {}
    }

    const basePayload: any = {
      appkey: String(appkey),
      authkey: String(authkey),
      to: formatTo91(to),
      message: String(message),
    };
    if ((req.body as any)?.template_id)
      basePayload.template_id = String((req.body as any).template_id);

    // Provider expects URL in 'file'
    const formPayload: Record<string, string> = { ...basePayload };
    if (tempUrl) formPayload.file = tempUrl;

    let result = await postFormUrlEncoded(String(endpoint), formPayload);

    if (!result.ok) {
      const jsonPayload = tempUrl
        ? { ...basePayload, file: tempUrl }
        : { ...basePayload };
      result = await postJson(String(endpoint), jsonPayload);
    }

    if (!result.ok) {
      return res
        .status(result.status || 502)
        .json({ error: "Remote API error", response: result.body });
    }

    res.json({ ok: true, response: result.body });
  } catch (e: any) {
    res
      .status(500)
      .json({
        error: "Failed to send WhatsApp",
        detail: e?.message || String(e),
      });
  }
});
