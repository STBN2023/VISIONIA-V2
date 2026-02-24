import { useEffect, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { showSuccess, showError } from "@/utils/toast";
import { getSettings, saveSettings, type APIProvider, type BackgroundMode, type ThemePreset } from "@/utils/settings";
import { GlassShell } from "@/components/layout/GlassShell";
import DatasetCalibrateCard from "@/components/settings/DatasetCalibrateCard";
import DatasetLabelerCard from "@/components/settings/DatasetLabelerCard";
import { AccountTab } from "@/components/settings/AccountTab";
import { ApiTab } from "@/components/settings/ApiTab";
import { AppearanceTab } from "@/components/settings/AppearanceTab";

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
    // Update local state with saved values to ensure consistency
    if (next) {
      setBackgroundMode((next.backgroundMode as BackgroundMode) ?? "image");
      setBackgroundImage(next.backgroundImage ?? "");
      setBackgroundColor(next.backgroundColor ?? "#0b1220");
      setBackgroundDim(next.backgroundDim ?? 20);
      setThemePreset((next.themePreset as ThemePreset) ?? "violet");
      setBrightness(next.brightness ?? 100);
    }
    showSuccess("Paramètres enregistrés");
  };

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
            <AccountTab />
          </TabsContent>

          <TabsContent value="api">
            <ApiTab
              provider={provider} setProvider={setProvider}
              apiKey={apiKey} setApiKey={setApiKey}
              model={model} setModel={setModel}
              temperature={temperature} setTemperature={setTemperature}
              maxTokens={maxTokens} setMaxTokens={setMaxTokens}
              endpoint={endpoint} setEndpoint={setEndpoint}
              azureDeployment={azureDeployment} setAzureDeployment={setAzureDeployment}
              onSave={handleSave}
            />
          </TabsContent>

          <TabsContent value="appearance">
            <AppearanceTab
              backgroundMode={backgroundMode} setBackgroundMode={setBackgroundMode}
              backgroundImage={backgroundImage} setBackgroundImage={setBackgroundImage}
              backgroundColor={backgroundColor} setBackgroundColor={setBackgroundColor}
              backgroundDim={backgroundDim} setBackgroundDim={setBackgroundDim}
              themePreset={themePreset} setThemePreset={setThemePreset}
              brightness={brightness} setBrightness={setBrightness}
              onSave={handleSave}
            />
          </TabsContent>

          <TabsContent value="dataset" className="space-y-6">
            <DatasetCalibrateCard />
            <DatasetLabelerCard />
          </TabsContent>
        </Tabs>
      </main>
    </GlassShell>
  );
};

export default Settings;
