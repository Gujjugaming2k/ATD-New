import { RequestHandler, Router } from "express";
import multer from "multer";

export const whatsappRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mime: string } {
  const [meta, base64] = (dataUrl || "").split(",");
  const mimeMatch = /data:([^;]+);base64/.exec(meta || "");
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const buffer = Buffer.from(base64 || "", "base64");
  return { buffer, mime };
}

whatsappRouter.post("/send", upload.single("file"), async (req, res) => {
  try {
    const { endpoint, appkey, authkey, to, message, imageDataUrl } = req.body || {};
    if (!endpoint || !appkey || !authkey || !to || !message) {
      return res.status(400).json({ error: "Missing endpoint/appkey/authkey/to/message" });
    }

    const form = new FormData();
    form.append("appkey", String(appkey));
    form.append("authkey", String(authkey));
    form.append("to", String(to));
    form.append("message", String(message));
    if ((req.body as any)?.template_id) form.append("template_id", String((req.body as any).template_id));

    if (req.file && req.file.buffer) {
      const u8 = new Uint8Array(req.file.buffer.buffer, req.file.buffer.byteOffset, req.file.buffer.byteLength);
      const blob = new Blob([u8], { type: req.file.mimetype || "image/png" });
      form.append("file", blob, req.file.originalname || "attendance.png");
    } else if (imageDataUrl) {
      const { buffer, mime } = dataUrlToBuffer(String(imageDataUrl));
      const u8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const blob = new Blob([u8], { type: mime });
      form.append("file", blob, "attendance.png");
    } else {
      return res.status(400).json({ error: "Missing file or imageDataUrl" });
    }

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
