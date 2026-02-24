import { useEffect, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { showSuccess, showError } from "@/utils/toast";
import { getSettings, saveSettings, type APIProvider, type BackgroundMode, type ThemePreset } from "@/utils/settings";
import { GlassShell } from "@/components/layout/GlassShell";
import { compressImageToBlob, blobToDataUrl } from "@/utils/image-compress";
import DatasetCalibrateCard from "@/components/settings/DatasetCalibrateCard";
import DatasetLabelerCard from "@/components/settings/DatasetLabelerCard";
import { supabase } from "@/integrations/supabase/client";

const MAX_BG_BYTES = 2.5 * 1024 * 1024; // ~2.5 Mo pour rester sous la limite de localStorage

const Settings = () => {
  const [provider, setProvider] = useState<APIProvider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o"); // Valeur par défaut
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

  const [newPassword, setNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      showError("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    setUpdatingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setUpdatingPassword(false);
    
    if (error) {
      showError(error.message);
    } else {
      showSuccess("Mot de passe mis à jour avec succès !");
      setNewPassword("");
    }
  };

  useEffect(() => {
    const s = getSettings();
    setProvider(s.provider);
    setApiKey(s.apiKey ?? "");
    setModel(s.model ?? "gpt-4o"); // Valeur par défaut
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
        showError("L'image de fond est trop lourde pour être enregistrée (quota localStorage). Choisissez une image plus légère.");
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

  // Gestion image de fond locale
  async function handlePickBackgroundFile(f: File) {
    // Compression rapide pour rester sous quota
    const blob = await compressImageToBlob(f, { maxWidth: 2400, quality: 0.82 });
    const dataUrl = await blobToDataUrl(blob);
    setBackgroundImage(dataUrl);
  }

  return (
    <GlassShell>
      <AppHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-8 text-white">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Paramètres</h1>
          <p className="text-white/60">Gérez vos clés API, vos modèles et votre sécurité.</p>
        </header>

        <Tabs defaultValue="account" className="w-full space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-white/10 text-white backdrop-blur-md">
            <TabsTrigger value="account">Compte</TabsTrigger>
            <TabsTrigger value="api">API</TabsTrigger>
            <TabsTrigger value="appearance">Apparence</TabsTrigger>
            <TabsTrigger value="dataset">Dataset</TabsTrigger>
          </TabsList>

          <TabsContent value="account">
            {/* BLOC SÉCURITÉ / MOT DE PASSE */}
            <Card className="rounded-3xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
              <CardHeader>
                <CardTitle>Sécurité du compte</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Nouveau mot de passe</Label>
                    <div className="flex gap-2">
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min. 6 caractères"
                        className="bg-white/10 border-white/20 text-white"
                      />
                      <Button 
                        onClick={handleUpdatePassword} 
                        disabled={updatingPassword}
                        className="backdrop-blur-sm whitespace-nowrap"
                      >
                        {updatingPassword ? "Mise à jour..." : "Modifier"}
                      </Button>
                    </div>
                  </div>
                  <p className="text-[10px] text-white/40 italic">
                    Note : Cette modification est immédiate et ne nécessite pas de confirmation par email (idéal pour contourner les limites du mode Free).
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="api">
            {/* Configuration API */}
            <Card className="rounded-3xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
              <CardHeader>
                <CardTitle>Configuration API</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {/* Provider */}
                <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-center">
                  <Label>Provider</Label>
                  <div>
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
                </div>

                {/* Clé API */}
                <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-start">
                  <Label>Clé API</Label>
                  <div className="space-y-1">
                    <Input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="bg-white/10 text-white placeholder:text-white/60"
                    />
                    <p className="text-xs text-white/70">Note: la clé est stockée localement (navigateur) pour la démo.</p>
                  </div>
                </div>

                {/* Modèle */}
                <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-center">
                  <Label>Modèle</Label>
                  <div>
                    <Select value={model} onValueChange={(v) => setModel(v as string)}>
                      <SelectTrigger className="bg-white/10 text-white">
                        <SelectValue placeholder="Choisir un modèle" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                        <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Température */}
                <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-center">
                  <Label>Température</Label>
                  <Input type="number" step="0.1" min="0" max="2" value={temperature} onChange={(e) => setTemperature(e.target.value)} className="bg-white/10 text-white" />
                </div>

                {/* Max tokens */}
                <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-center">
                  <Label>Max tokens</Label>
                  <Input type="number" min="1" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} className="bg-white/10 text-white" />
                </div>

                {/* Endpoint */}
                <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-start">
                  <Label>Endpoint (optionnel)</Label>
                  <div className="space-y-1">
                    <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.openai.com/v1" className="bg-white/10 text-white placeholder:text-white/60" />
                    <p className="text-xs text-white/70">Utilisez un endpoint custom si nécessaire (Azure, proxy...).</p>
                  </div>
                </div>

                {/* Azure deployment (si Azure) */}
                {provider === "azure" ? (
                  <div className="grid gap-2 md:col-span-2 md:grid-cols-[220px,1fr] md:items-center">
                    <Label>Nom du déploiement Azure</Label>
                    <Input value={azureDeployment} onChange={(e) => setAzureDeployment(e.target.value)} placeholder="ex: gpt-4o-prod" className="bg-white/10 text-white placeholder:text-white/60" />
                  </div>
                ) : null}
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button onClick={handleSave} className="backdrop-blur-sm">Enregistrer</Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="appearance">
            {/* Apparence */}
            <Card className="rounded-3xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
              <CardHeader>
                <CardTitle>Apparence</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {/* Palette */}
                <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-center">
                  <Label>Palette d'accent</Label>
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
                  <Label>Mode d'arrière‑plan</Label>
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
                              Retirer l'image
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </>
                ) : (
                  // Couleur
                  <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-center">
                    <Label>Couleur d'arrière‑plan</Label>
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
          </TabsContent>

          <TabsContent value="dataset" className="space-y-6">
            {/* Dataset & Calibrage (YOLOv5-cls) */}
            <DatasetCalibrateCard />

            {/* Classification manuelle du dataset */}
            <DatasetLabelerCard />
          </TabsContent>
        </Tabs>
      </main>
    </GlassShell>
  );
};

export default Settings;