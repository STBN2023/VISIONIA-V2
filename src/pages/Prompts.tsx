import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Trash2, Copy, Save, Star } from "lucide-react";
import { showError, showSuccess } from "@/utils/toast";
import {
  ensureSeedTemplates,
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  setDefaultTemplate,
  type PromptTemplate,
  getPromptLineErrors,
} from "@/utils/prompts";
import { GlassShell } from "@/components/layout/GlassShell";

const Prompts = () => {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => templates.find((t) => t.id === selectedId) || null, [templates, selectedId]);

  useEffect(() => {
    (async () => {
      await ensureSeedTemplates();
      setTemplates(getTemplates());
    })();
  }, []);

  useEffect(() => {
    if (!selectedId && templates.length > 0) {
      const def = templates.find((t) => t.isDefault) || templates[0];
      setSelectedId(def.id);
    }
  }, [templates, selectedId]);

  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    setName(selected?.name ?? "");
    setBody(selected?.body ?? "");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lineErrors = useMemo(() => getPromptLineErrors(body), [body]);

  const refresh = () => setTemplates(getTemplates());

  const handleNew = () => {
    const tpl = createTemplate({
      name: "Nouveau template",
      body: "Constat technique:\n- ...\n\nSolutions correctives:\n- ...\n\nConformité réglementaire:\n- ...",
    });
    refresh();
    setSelectedId(tpl.id);
    showSuccess("Template créé");
  };

  const handleDuplicate = () => {
    if (!selected) return;
    const tpl = createTemplate({
      name: `${selected.name} (copie)`,
      body: selected.body,
    });
    refresh();
    setSelectedId(tpl.id);
    showSuccess("Template dupliqué");
  };

  const handleSave = () => {
    if (!selected) return;
    if (name.trim().length < 3) {
      showError("Nom trop court (≥ 3 caractères).");
      return;
    }
    updateTemplate(selected.id, { name: name.trim(), body });
    refresh();
    showSuccess("Template enregistré");
  };

  const handleDelete = () => {
    if (!selected) return;
    if (!confirm("Supprimer ce template ?")) return;
    deleteTemplate(selected.id);
    refresh();
    setSelectedId(null);
    showSuccess("Template supprimé");
  };

  const markDefault = () => {
    if (!selected) return;
    setDefaultTemplate(selected.id);
    refresh();
    showSuccess("Template défini par défaut");
  };

  return (
    <GlassShell>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 text-white">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Modèles d'analyse</h1>
            <p className="text-sm text-white/70">
             Créez des styles d'analyse globaux, définissez un modèle par défaut, puis appliquez-les à l'ensemble de vos projets et images.
            </p>
          </div>
          <Button onClick={handleNew} className="backdrop-blur-sm">Nouveau template</Button>
        </div>
        <Separator className="mb-6 border-white/20" />

        <div className="grid gap-6 md:grid-cols-3">
          <div className="space-y-2 md:col-span-1">
            {templates.map((t) => (
              <Card
                key={t.id}
                className={`cursor-pointer rounded-3xl border-white/20 bg-white/10 text-white shadow-2xl backdrop-blur-2xl ${selectedId === t.id ? "ring-2 ring-white/40" : ""}`}
                onClick={() => setSelectedId(t.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base line-clamp-1">{t.name}</CardTitle>
                    {t.isDefault ? <Badge variant="secondary">Défaut</Badge> : null}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm text-white/80">{t.body}</p>
                </CardContent>
                <CardFooter className="text-xs text-white/70">
                  v{t.version} • {new Date(t.updatedAt).toLocaleDateString()}
                </CardFooter>
              </Card>
            ))}
            {templates.length === 0 ? (
              <p className="text-sm text-white/80">Aucun template pour le moment.</p>
            ) : null}
          </div>

          <div className="md:col-span-2">
            {!selected ? (
              <Card className="rounded-3xl border-white/20 bg-white/10 p-6 text-sm text-white/80 backdrop-blur-2xl">
                Sélectionnez un template pour l'éditer.
              </Card>
            ) : (
              <Card className="rounded-3xl border-white/20 bg-white/10 text-white shadow-2xl backdrop-blur-2xl">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>Édition du template</CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDuplicate}
                        className="border-white/30 bg-transparent text-white hover:bg-white/10 backdrop-blur-sm"
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Dupliquer
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={markDefault}
                        className="border-white/30 bg-transparent text-white hover:bg-white/10 backdrop-blur-sm"
                      >
                        <Star className="mr-2 h-4 w-4" />
                        Définir par défaut
                      </Button>
                      <Button variant="ghost" size="sm" onClick={handleDelete} className="text-white hover:bg-white/10">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Supprimer
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Nom</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="bg-white/10 text-white placeholder:text-white/60" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="body">Contenu</Label>
                    <Textarea id="body" rows={14} value={body} onChange={(e) => setBody(e.target.value)} className="bg-white/10 text-white placeholder:text-white/60" />
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                  <Button onClick={handleSave} className="backdrop-blur-sm">
                    <Save className="mr-2 h-4 w-4" />
                    Enregistrer
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>
        </div>
      </main>
    </GlassShell>
  );
};

export default Prompts;