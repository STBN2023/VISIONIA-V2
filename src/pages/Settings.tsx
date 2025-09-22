import { useEffect, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { showSuccess } from "@/utils/toast";
import { getSettings, saveSettings, type APIProvider } from "@/utils/settings";
import { GlassShell } from "@/components/layout/GlassShell";

const Settings = () => {
  const [provider, setProvider] = useState<APIProvider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState<number | string>(0.2);
  const [maxTokens, setMaxTokens] = useState<number | string>(2000);
  const [endpoint, setEndpoint] = useState("");
  const [azureDeployment, setAzureDeployment] = useState("");

  // Apparence
  const [backgroundImage, setBackgroundImage] = useState("");
  const [backgroundDim, setBackgroundDim] = useState<number>(20);

  useEffect(() => {
    const s = getSettings();
    setProvider(s.provider);
    setApiKey(s.apiKey ?? "");
    setModel(s.model ?? "");
    setTemperature(s.temperature ?? 0.2);
    setMaxTokens(s.maxTokens ?? 2000);
    setEndpoint(s.endpoint ?? "");
    setAzureDeployment(s.azureDeployment ?? "");
    setBackgroundImage(s.backgroundImage ?? "");
    setBackgroundDim(typeof s.backgroundDim === "number" ? s.backgroundDim : 20);
  }, []);

  const handleSave = () => {
    const next = saveSettings({
      provider,
      apiKey: apiKey.trim() || undefined,
      model: model.trim() || undefined,
      temperature: Number(temperature),
      maxTokens: Number(maxTokens),
      endpoint: endpoint.trim() || undefined,
      azureDeployment: azureDeployment.trim() || undefined,
      backgroundImage: backgroundImage.trim() || undefined,
      backgroundDim: Math.max(0, Math.min(100, Number(backgroundDim))),
    });
    setBackgroundImage(next.backgroundImage ?? "");
    setBackgroundDim(next.backgroundDim ?? 20);
    showSuccess("Paramètres enregistrés");
  };

  return (
    <GlassShell>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 text-white">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold">Paramètres</h1>
          <p className="text-sm text-white/70">Configurer l’API LLM et l’apparence du fond (contraste).</p>
        </div>
        <Separator className="mb-6 border-white/20" />

        <Card className="rounded-3xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
          <CardHeader>
            <CardTitle>Configuration API</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as APIProvider)}>
                <SelectTrigger className="bg-white/10 text-white">
                  <SelectValue placeholder="Choisir un provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="azure">Azure OpenAI</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Clé API</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="bg-white/10 text-white placeholder:text-white/60"
              />
              <p className="text-xs text-white/70">Note: la clé est stockée localement (navigateur) pour la démo.</p>
            </div>

            <div className="grid gap-2">
              <Label>Modèle</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="ex: gpt-4o, claude-3-5, ..." className="bg-white/10 text-white placeholder:text-white/60" />
            </div>

            <div className="grid gap-2">
              <Label>Température</Label>
              <Input type="number" step="0.1" min="0" max="2" value={temperature} onChange={(e) => setTemperature(e.target.value)} className="bg-white/10 text-white" />
            </div>

            <div className="grid gap-2">
              <Label>Max tokens</Label>
              <Input type="number" min="1" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} className="bg-white/10 text-white" />
            </div>

            <div className="grid gap-2">
              <Label>Endpoint (optionnel)</Label>
              <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.openai.com/v1" className="bg-white/10 text-white placeholder:text-white/60" />
              <p className="text-xs text-white/70">Utilisez un endpoint custom si nécessaire (Azure, proxy...).</p>
            </div>

            {provider === "azure" ? (
              <div className="grid gap-2 md:col-span-2">
                <Label>Nom du déploiement Azure</Label>
                <Input value={azureDeployment} onChange={(e) => setAzureDeployment(e.target.value)} placeholder="ex: gpt-4o-prod" className="bg-white/10 text-white placeholder:text-white/60" />
              </div>
            ) : null}
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button onClick={handleSave} className="backdrop-blur-sm">Enregistrer</Button>
          </CardFooter>
        </Card>

        <Card className="mt-6 rounded-3xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
          <CardHeader>
            <CardTitle>Apparence</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label>Image de fond (URL)</Label>
              <Input
                value={backgroundImage}
                onChange={(e) => setBackgroundImage(e.target.value)}
                placeholder="https://… (Unsplash, CDN interne, etc.)"
                className="bg-white/10 text-white placeholder:text-white/60"
              />
              <p className="text-xs text-white/70">
                Utilisez une image large (≥ 1920px). L’URL peut pointer vers votre CDN pour de meilleures perfs.
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Contraste du fond (voile sombre): {Math.round(backgroundDim)}%</Label>
              <div className="px-2">
                <Slider
                  value={[backgroundDim]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => setBackgroundDim(v[0] ?? 0)}
                />
              </div>
              <p className="text-xs text-white/70">
                Augmenter la valeur assombrit le fond pour améliorer la lisibilité des contenus.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button onClick={handleSave} className="backdrop-blur-sm">Enregistrer</Button>
          </CardFooter>
        </Card>
      </main>
    </GlassShell>
  );
};

export default Settings;