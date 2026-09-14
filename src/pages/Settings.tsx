import { useEffect, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { showSuccess, showError } from "@/utils/toast";
import { type APIProvider, type BackgroundMode, type BackgroundFit, type ThemePreset, type AppearanceOverride } from "@/utils/settings";
import { useSettings } from "@/contexts/SettingsContext";
import { GlassShell } from "@/components/layout/GlassShell";
import DatasetCalibrateCard from "@/components/settings/DatasetCalibrateCard";
import DatasetLabelerCard from "@/components/settings/DatasetLabelerCard";
import DownloadLinksCard from "@/components/settings/DownloadLinksCard";
import { AccountTab } from "@/components/settings/AccountTab";
import { ApiTab } from "@/components/settings/ApiTab";
import { AppearanceTab } from "@/components/settings/AppearanceTab";

const MAX_BG_BYTES = 2.5 * 1024 * 1024; // ~2.5 Mo pour rester sous la limite de localStorage

const Settings = () => {
  const { settings, updateSettings } = useSettings();

  const [provider, setProvider] = useState<APIProvider>("openai");
  const [model, setModel] = useState("gpt-4o"); 
  const [temperature, setTemperature] = useState<number | string>(0.2);
  const [maxTokens, setMaxTokens] = useState<number | string>(2000);
  const [endpoint, setEndpoint] = useState("");
  const [azureDeployment, setAzureDeployment] = useState("");

  // Apparence
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("image");
  const [backgroundImage, setBackgroundImage] = useState("");
  const [backgroundColor, setBackgroundColor] = useState("#0b1220");
  const [backgroundDim, setBackgroundDim] = useState<number>(20);
  const [backgroundFit, setBackgroundFit] = useState<BackgroundFit>("cover");
  const [backgroundScale, setBackgroundScale] = useState<number>(100);
  const [themePreset, setThemePreset] = useState<ThemePreset>("violet");
  const [brightness, setBrightness] = useState<number>(100);

  // Sync local state with context settings when they change (e.g. after cloud load)
  useEffect(() => {
    setProvider(settings.provider);
    setModel(settings.model ?? "gpt-4o");
    setTemperature(settings.temperature ?? 0.2);
    setMaxTokens(settings.maxTokens ?? 2000);
    setEndpoint(settings.endpoint ?? "");
    setAzureDeployment(settings.azureDeployment ?? "");
    setBackgroundMode((settings.backgroundMode as BackgroundMode) ?? "image");
    setBackgroundImage(settings.backgroundImage ?? "");
    setBackgroundColor(settings.backgroundColor ?? "#0b1220");
    setBackgroundDim(typeof settings.backgroundDim === "number" ? settings.backgroundDim : 20);
    setBackgroundFit((settings.backgroundFit as BackgroundFit) ?? "cover");
    setBackgroundScale(typeof settings.backgroundScale === "number" ? settings.backgroundScale : 100);
    setThemePreset((settings.themePreset as ThemePreset) ?? "violet");
    setBrightness(typeof settings.brightness === "number" ? settings.brightness : 100);
  }, [settings]);

  // Aperçu en direct : GlassShell écoute "settings:updated" mais personne ne
  // l'émettait, si bien que tout changement d'apparence exigeait un
  // rechargement. On diffuse ici les valeurs en cours d'édition — avant
  // enregistrement — pour que le fond suive le curseur.
  useEffect(() => {
    const detail: AppearanceOverride = {
      backgroundMode,
      backgroundImage,
      backgroundColor,
      backgroundDim,
      backgroundFit,
      backgroundScale,
      themePreset,
      brightness,
    };
    window.dispatchEvent(new CustomEvent("settings:updated", { detail }));
  }, [
    backgroundMode,
    backgroundImage,
    backgroundColor,
    backgroundDim,
    backgroundFit,
    backgroundScale,
    themePreset,
    brightness,
  ]);

  const handleSave = () => {
    // Note: We skip the size check here because AppearanceTab now handles upload to Supabase
    // But for "offline" mode (base64), the check is done inside AppearanceTab component before calling setBackgroundImage
    // Wait, setBackgroundImage just updates local state here. 
    // The check for size should be done before updateSettings if it's base64?
    // Actually, AppearanceTab handles the upload/conversion and calls setBackgroundImage with the result (URL or DataURL).
    // If it's a huge DataURL, we might want to prevent saving it to Context if it exceeds limits?
    // Let's keep the check for safety.
    
    if (backgroundMode === "image" && backgroundImage.startsWith("data:")) {
       const approxBytes = backgroundImage.length * 0.75; 
       if (approxBytes > MAX_BG_BYTES) {
         showError("L'image est trop lourde pour être enregistrée localement. Connectez-vous pour l'uploader.");
         return;
       }
    }

    updateSettings({
      provider,
      model: model.trim() || undefined,
      temperature: Number(temperature),
      maxTokens: Number(maxTokens),
      endpoint: endpoint.trim() || undefined,
      azureDeployment: azureDeployment.trim() || undefined,
      backgroundMode,
      backgroundImage: backgroundMode === "image" ? (backgroundImage.trim() || undefined) : undefined,
      backgroundColor: backgroundMode === "color" ? (backgroundColor || "#0b1220") : undefined,
      backgroundDim: Math.max(0, Math.min(100, Number(backgroundDim))),
      backgroundFit,
      backgroundScale: Math.max(20, Math.min(400, Number(backgroundScale))),
      themePreset,
      brightness: Math.max(50, Math.min(150, Number(brightness))),
    });
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
              backgroundFit={backgroundFit} setBackgroundFit={setBackgroundFit}
              backgroundScale={backgroundScale} setBackgroundScale={setBackgroundScale}
              themePreset={themePreset} setThemePreset={setThemePreset}
              brightness={brightness} setBrightness={setBrightness}
              onSave={handleSave}
            />
          </TabsContent>

          <TabsContent value="dataset" className="space-y-6">
            <DownloadLinksCard />
            <DatasetCalibrateCard />
            <DatasetLabelerCard />
          </TabsContent>
        </Tabs>
      </main>
    </GlassShell>
  );
};

export default Settings;