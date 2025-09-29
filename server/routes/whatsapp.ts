import { RequestHandler, Router } from "express";
import multer from "multer";
import FormData from "form-data";

export const whatsappRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

whatsappRouter.post("/send", upload.single("file"), async (req, res) => {
  try {
    const { endpoint, appkey, authkey, to, message } = req.body || {};
    if (!endpoint || !appkey || !authkey || !to || !message || !req.file) {
      return res.status(400).json({ error: "Missing endpoint/appkey/authkey/to/message/file" });
    }

    const form = new FormData();
    form.append("appkey", String(appkey));
    form.append("authkey", String(authkey));
    form.append("to", String(to));
    form.append("message", String(message));
    form.append("file", req.file.buffer, {
      filename: req.file.originalname || "attendance.png",
      contentType: req.file.mimetype || "image/png",
    } as any);

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
