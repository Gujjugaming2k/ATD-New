import { RequestHandler, Router } from "express";

export const whatsappRouter = Router();

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(",");
  const mimeMatch = /data:([^;]+);base64/.exec(meta || "");
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const buffer = Buffer.from(base64 || "", "base64");
  return new Blob([buffer], { type: mime });
}

export const sendWhatsApp: RequestHandler = async (req, res) => {
  try {
    const { endpoint, appkey, authkey, to, message, imageDataUrl } = req.body || {};
    if (!endpoint || !appkey || !authkey || !to || !message || !imageDataUrl) {
      return res.status(400).json({ error: "Missing endpoint/appkey/authkey/to/message/imageDataUrl" });
    }

    const form = new FormData();
    form.append("appkey", String(appkey));
    form.append("authkey", String(authkey));
    form.append("to", String(to));
    form.append("message", String(message));

    const blob = dataUrlToBlob(String(imageDataUrl));
    form.append("file", blob, "attendance.png");

    const target = String(endpoint);
    const resp = await fetch(target, {
      method: "POST",
      body: form,
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
};

whatsappRouter.post("/send", sendWhatsApp);
