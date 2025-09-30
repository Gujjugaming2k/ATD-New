import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const STORAGE_KEY = "whatsappConfig";

type WhatsAppConfig = {
  endpoint: string;
  appkey: string;
  authkey: string;
  templateId?: string;
  imageHost?: string; // e.g. https://your-domain.com
};

function defaultConfig(): WhatsAppConfig {
  return {
    endpoint: "https://whatsapp.atdsonata.fun/api/create-message",
    appkey: "",
    authkey: "",
    templateId: "",
    imageHost: "",
  };
}

function loadConfig(): WhatsAppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    const parsed = JSON.parse(raw);
    return {
      endpoint: parsed.endpoint || defaultConfig().endpoint,
      appkey: parsed.appkey || "",
      authkey: parsed.authkey || "",
      templateId: parsed.templateId || "",
      imageHost: parsed.imageHost || "",
    };
  } catch {
    return defaultConfig();
  }
}

function saveLocal(cfg: WhatsAppConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export default function WhatsAppSettings() {
  const [config, setConfig] = useState<WhatsAppConfig>(() => loadConfig());
  const [loading, setLoading] = useState(false);

  // Load server-side config on mount and prefer it over local
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/whatsapp/config");
        if (!resp.ok) return; // ignore if not available
        const j = (await resp.json()) as Partial<WhatsAppConfig>;
        const merged: WhatsAppConfig = {
          endpoint: j.endpoint || config.endpoint || defaultConfig().endpoint,
          appkey: j.appkey ?? config.appkey ?? "",
          authkey: j.authkey ?? config.authkey ?? "",
          templateId: j.templateId ?? config.templateId ?? "",
          imageHost: j.imageHost ?? config.imageHost ?? "",
        };
        if (!cancelled) {
          setConfig(merged);
          try {
            saveLocal(merged);
          } catch {}
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep localStorage in sync for offline usage
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        saveLocal(config);
      } catch {}
    }, 400);
    return () => clearTimeout(id);
  }, [config]);

  async function handleSave() {
    if (!config.endpoint || !config.appkey || !config.authkey) {
      toast.error("Enter endpoint, appkey and authkey");
      return;
    }
    try {
      setLoading(true);
      const resp = await fetch("/api/whatsapp/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.error(j);
        toast.error("Failed to save to server");
        return;
      }
      saveLocal(config);
      toast.success("WhatsApp settings saved to server");
    } catch (e) {
      console.error(e);
      toast.error("Error saving settings");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto py-10 space-y-6">
      <section className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight">
          WhatsApp Settings
        </h1>
        <p className="text-muted-foreground">
          Store API details for sending reports on WhatsApp.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>API Credentials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">Endpoint</label>
            <Input
              value={config.endpoint}
              onChange={(e) =>
                setConfig((c) => ({ ...c, endpoint: e.target.value }))
              }
              placeholder="https://whatsapp.atdsonata.fun/api/create-message"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">App Key</label>
            <Input
              type="password"
              autoComplete="off"
              value={config.appkey}
              onChange={(e) =>
                setConfig((c) => ({ ...c, appkey: e.target.value }))
              }
              placeholder="your appkey"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Auth Key</label>
            <Input
              type="password"
              autoComplete="off"
              value={config.authkey}
              onChange={(e) =>
                setConfig((c) => ({ ...c, authkey: e.target.value }))
              }
              placeholder="your authkey"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">
              Image Host URL
            </label>
            <Input
              value={config.imageHost || ""}
              onChange={(e) =>
                setConfig((c) => ({ ...c, imageHost: e.target.value }))
              }
              placeholder="https://your-domain.com"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Optional. If set, generated image URLs will use this host instead
              of the app origin.
            </p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">
              Template ID (optional)
            </label>
            <Input
              value={config.templateId || ""}
              onChange={(e) =>
                setConfig((c) => ({ ...c, templateId: e.target.value }))
              }
              placeholder="e.g. 1234 (if your provider requires it)"
            />
          </div>
          <div className="pt-2">
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
