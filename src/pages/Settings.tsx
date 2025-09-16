import { useEffect, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { showSuccess } from "@/utils/toast";
import { getSettings, saveSettings, type APIProvider } from "@/utils/settings";

const Settings = () => {
  const [provider, setProvider] = useState<APIProvider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState<number | string>(0.2);
  const [maxTokens, setMaxTokens] = useState<number | string>(2000);
  const [endpoint, setEndpoint] = useState("");
  const [azureDeployment, setAzureDeployment] = useState("");

  useEffect(() => {
    const s = getSettings();
    setProvider(s.provider);
    setApiKey(s.apiKey ?? "");
    setModel(s.model ?? "");
    setTemperature(s.temperature ?? 0.2);
    setMaxTokens(s.maxTokens ?? 2000);
    setEndpoint(s.endpoint ?? "");
    setAzureDeployment(s.azureDeployment ?? "");
  }, []);

  const handleSave = () => {
    saveSettings({
      provider,
      apiKey: apiKey.trim() || undefined,
      model: model.trim() || undefined,
      temperature: Number(temperature),
      maxTokens: Number(maxTokens),
      endpoint: endpoint.trim() || undefined,
      azureDeployment: azureDeployment.trim() || undefined,
    });
    showSuccess("Paramètres API enregistrés");
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold">Paramètres API</h1>
          <p className="text-sm text-muted-foreground">Configurer le provider LLM et les paramètres par défaut.</p>
        </div>
        <Separator className="mb-6" />

        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as APIProvider)}>
                <SelectTrigger>
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
              />
              <p className="text-xs text-muted-foreground">Note: la clé est stockée localement (navigateur) pour la démo.</p>
            </div>

            <div className="grid gap-2">
              <Label>Modèle</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="ex: gpt-4o, claude-3-5, ..." />
            </div>

            <div className="grid gap-2">
              <Label>Température</Label>
              <Input type="number" step="0.1" min="0" max="2" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
            </div>

            <div className="grid gap-2">
              <Label>Max tokens</Label>
              <Input type="number" min="1" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
            </div>

            <div className="grid gap-2">
              <Label>Endpoint (optionnel)</Label>
              <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.openai.com/v1" />
              <p className="text-xs text-muted-foreground">Utilisez un endpoint custom si nécessaire (Azure, proxy...).</p>
            </div>

            {provider === "azure" ? (
              <div className="grid gap-2 md:col-span-2">
                <Label>Nom du déploiement Azure</Label>
                <Input value={azureDeployment} onChange={(e) => setAzureDeployment(e.target.value)} placeholder="ex: gpt-4o-prod" />
              </div>
            ) : null}
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button onClick={handleSave}>Enregistrer</Button>
          </CardFooter>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Sécurité des clés</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              Pour un usage en production, évitez de stocker des clés côté client. Ajoutez un backend (ex: Supabase) pour gérer les secrets côté serveur.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Settings;