import { RequestHandler, Router } from "express";
import multer from "multer";
import FormData from "form-data";

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

    if (req.file && req.file.buffer) {
      form.append("file", req.file.buffer, {
        filename: req.file.originalname || "attendance.png",
        contentType: req.file.mimetype || "image/png",
      } as any);
    } else if (imageDataUrl) {
      const { buffer, mime } = dataUrlToBuffer(String(imageDataUrl));
      form.append("file", buffer, {
        filename: "attendance.png",
        contentType: mime,
      } as any);
    } else {
      return res.status(400).json({ error: "Missing file or imageDataUrl" });
    }

    const target = String(endpoint);
    const resp = await fetch(target, {
      method: "POST",
      body: form as any,
      headers: form.getHeaders(),
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
