import { useEffect, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { showSuccess, showError } from "@/utils/toast";
import { getSettings, saveSettings, type APIProvider, type BackgroundMode, type ThemePreset } from "@/utils/settings";
import { GlassShell } from "@/components/layout/GlassShell";
import { compressImageToBlob, blobToDataUrl } from "@/utils/image-compress";

const MAX_BG_BYTES = 2.5 * 1024 * 1024; // ~2.5 Mo pour rester sous la limite de localStorage

const Settings = () => {
  const [provider, setProvider] = useState<APIProvider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState<number | string>(0.2);
  const [maxTokens, setMaxTokens] = useState<number | string>(2000);
  const [endpoint, setEndpoint] = useState("");
  const [azureDeployment, setAzureDeployment] = useState("");

  // Apparence
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("image");
  const [backgroundImage, setBackgroundImage] = useState("");
  const [backgroundColor, setBackgroundColor] = useState("#0b1220");
  const [backgroundDim, setBackgroundDim] = useState<number>(20);
  const [themePreset, setThemePreset] = useState<ThemePreset>("violet");
  const [brightness, setBrightness] = useState<number>(100);

  useEffect(() => {
    const s = getSettings();
    setProvider(s.provider);
    setApiKey(s.apiKey ?? "");
    setModel(s.model ?? "");
    setTemperature(s.temperature ?? 0.2);
    setMaxTokens(s.maxTokens ?? 2000);
    setEndpoint(s.endpoint ?? "");
    setAzureDeployment(s.azureDeployment ?? "");
    setBackgroundMode((s.backgroundMode as BackgroundMode) ?? "image");
    setBackgroundImage(s.backgroundImage ?? "");
    setBackgroundColor(s.backgroundColor ?? "#0b1220");
    setBackgroundDim(typeof s.backgroundDim === "number" ? s.backgroundDim : 20);
    setThemePreset((s.themePreset as ThemePreset) ?? "violet");
    setBrightness(typeof s.brightness === "number" ? s.brightness : 100);
  }, []);

  const handleSave = () => {
    if (backgroundMode === "image" && backgroundImage.startsWith("data:")) {
      const approxBytes = backgroundImage.length * 0.75; // estimation base64
      if (approxBytes > MAX_BG_BYTES) {
        showError("L’image de fond est trop lourde pour être enregistrée (quota localStorage). Choisissez une image plus légère.");
        return;
      }
    }

    const next = saveSettings({
      provider,
      apiKey: apiKey.trim() || undefined,
      model: model.trim() || undefined,
      temperature: Number(temperature),
      maxTokens: Number(maxTokens),
      endpoint: endpoint.trim() || undefined,
      azureDeployment: azureDeployment.trim() || undefined,
      backgroundMode,
      backgroundImage: backgroundMode === "image" ? (backgroundImage.trim() || undefined) : undefined,
      backgroundColor: backgroundMode === "color" ? (backgroundColor || "#0b1220") : undefined,
      backgroundDim: Math.max(0, Math.min(100, Number(backgroundDim))),
      themePreset,
      brightness: Math.max(50, Math.min(150, Number(brightness))),
    });
    setBackgroundMode((next.backgroundMode as BackgroundMode) ?? "image");
    setBackgroundImage(next.backgroundImage ?? "");
    setBackgroundColor(next.backgroundColor ?? "#0b1220");
    setBackgroundDim(next.backgroundDim ?? 20);
    setThemePreset((next.themePreset as ThemePreset) ?? "violet");
    setBrightness(next.brightness ?? 100);
    showSuccess("Paramètres enregistrés");
  };

  // Compression contrôlée de l’image choisie avant stockage
  const handlePickBackgroundFile = async (file: File) => {
    // 1er essai: taille confortable
    let out = await compressImageToBlob(file, {
      maxWidth: 2000,
      maxHeight: 1500,
      quality: 0.82,
      convertTo: "image/webp",
    });

    // Si encore trop lourd, 2e essai plus agressif
    if (out.size > MAX_BG_BYTES) {
      out = await compressImageToBlob(file, {
        maxWidth: 1600,
        maxHeight: 1200,
        quality: 0.7,
        convertTo: "image/webp",
      });
    }

    if (out.size > MAX_BG_BYTES) {
      showError("Image trop lourde même après compression. Essayez une image plus petite.");
      return;
    }

    const dataUrl = await blobToDataUrl(out);
    setBackgroundImage(dataUrl);
    showSuccess("Image compressée et chargée");
  };

  return (
    <GlassShell>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 text-white">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold">Paramètres</h1>
          <p className="text-sm text-white/70">Configurer l’API LLM et l’apparence du fond (image, couleur, contraste, palette, luminosité).</p>
        </div>
        <Separator className="mb-6 border-white/20" />

        {/* Configuration API */}
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

        {/* Apparence */}
        <Card className="mt-6 rounded-3xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
          <CardHeader>
            <CardTitle>Apparence</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {/* Palette */}
            <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-center">
              <Label>Palette d’accent</Label>
              <div>
                <Select value={themePreset} onValueChange={(v) => setThemePreset(v as ThemePreset)}>
                  <SelectTrigger className="bg-white/10 text-white">
                    <SelectValue placeholder="Choisir une palette" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="violet">Violet (par défaut)</SelectItem>
                    <SelectItem value="blue">Bleu</SelectItem>
                    <SelectItem value="neutral">Neutre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Mode d'arrière-plan */}
            <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-center">
              <Label>Mode d’arrière‑plan</Label>
              <div>
                <RadioGroup value={backgroundMode} onValueChange={(v) => setBackgroundMode(v as BackgroundMode)}>
                  <div className="flex items-center gap-3">
                    <RadioGroupItem id="mode-image" value="image" />
                    <Label htmlFor="mode-image">Image</Label>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <RadioGroupItem id="mode-color" value="color" />
                    <Label htmlFor="mode-color">Couleur</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            {/* Image: URL */}
            {backgroundMode === "image" ? (
              <>
                <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-start">
                  <Label>Image de fond (URL)</Label>
                  <div className="space-y-2">
                    <Input
                      value={backgroundImage}
                      onChange={(e) => setBackgroundImage(e.target.value)}
                      placeholder="https://… (Unsplash, CDN interne, etc.)"
                      className="bg-white/10 text-white placeholder:text-white/60"
                    />
                    <p className="text-xs text-white/70">
                      Vous pouvez saisir une URL ou choisir un fichier ci‑dessous. Les fichiers locaux sont compressés automatiquement pour respecter le quota du navigateur.
                    </p>
                  </div>
                </div>

                {/* Image: fichier */}
                <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-start">
                  <Label>Choisir un fichier</Label>
                  <div className="space-y-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        await handlePickBackgroundFile(f);
                      }}
                      className="bg-white/10 text-white file:mr-2 file:rounded file:border-0 file:bg-white/20 file:px-3 file:py-2 file:text-white"
                    />
                    {backgroundImage ? (
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-20 overflow-hidden rounded-xl border border-white/20 bg-white/10">
                          {/* eslint-disable-next-line jsx-a11y/alt-text */}
                          <img src={backgroundImage} className="h-full w-full object-cover" />
                        </div>
                        <Button
                          variant="ghost"
                          className="text-white/90 hover:bg-white/10"
                          onClick={() => setBackgroundImage("")}
                        >
                          Retirer l’image
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              // Couleur
              <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-center">
                <Label>Couleur d’arrière‑plan</Label>
                <div className="flex flex-wrap items-center gap-4">
                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    aria-label="Choisir une couleur"
                    className="h-10 w-14 cursor-pointer rounded-lg border border-white/20 bg-transparent p-0"
                  />
                  <Input
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    placeholder="#0b1220"
                    className="max-w-[160px] bg-white/10 text-white placeholder:text-white/60"
                  />
                  <div
                    className="h-10 w-16 rounded-lg border border-white/20"
                    style={{ backgroundColor: backgroundColor }}
                    aria-hidden
                  />
                </div>
              </div>
            )}

            {/* Contraste */}
            <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-center">
              <Label>Contraste du fond (voile sombre): {Math.round(backgroundDim)}%</Label>
              <div>
                <div className="px-2">
                  <Slider
                    value={[backgroundDim]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={(v) => setBackgroundDim(v[0] ?? 0)}
                  />
                </div>
                <p className="mt-1 text-xs text-white/70">
                  Augmenter la valeur assombrit le fond pour améliorer la lisibilité des contenus.
                </p>
              </div>
            </div>

            {/* Luminosité */}
            <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-center">
              <Label>Luminosité du fond: {Math.round(brightness)}%</Label>
              <div>
                <div className="px-2">
                  <Slider
                    value={[brightness]}
                    min={50}
                    max={150}
                    step={1}
                    onValueChange={(v) => setBrightness(v[0] ?? 100)}
                  />
                </div>
                <p className="mt-1 text-xs text-white/70">
                  Ajuste la luminosité du fond (50% = plus sombre, 150% = plus lumineux). Valeur par défaut: 100%.
                </p>
              </div>
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