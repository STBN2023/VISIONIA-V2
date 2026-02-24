import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { type APIProvider } from "@/utils/settings";

interface ApiTabProps {
  provider: APIProvider;
  setProvider: (v: APIProvider) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  temperature: number | string;
  setTemperature: (v: number | string) => void;
  maxTokens: number | string;
  setMaxTokens: (v: number | string) => void;
  endpoint: string;
  setEndpoint: (v: string) => void;
  azureDeployment: string;
  setAzureDeployment: (v: string) => void;
  onSave: () => void;
}

export function ApiTab({
  provider, setProvider,
  apiKey, setApiKey,
  model, setModel,
  temperature, setTemperature,
  maxTokens, setMaxTokens,
  endpoint, setEndpoint,
  azureDeployment, setAzureDeployment,
  onSave
}: ApiTabProps) {
  return (
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
            <p className="text-xs text-white/70">Note: la clé est stockée dans votre profil et transmise de manière sécurisée via un proxy serveur. Elle n'est jamais exposée côté navigateur.</p>
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
        <Button onClick={onSave} className="backdrop-blur-sm">Enregistrer</Button>
      </CardFooter>
    </Card>
  );
}
