import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { getProjectById, updateProject, type Project, type ProjectImage, fileToDataUrl, type ImageTag, type ProjectStatus } from "@/utils/storage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Image as ImageIcon, Upload, Trash2, ArrowLeft, ArrowLeftCircle, ArrowRightCircle } from "lucide-react";
import { showError, showSuccess } from "@/utils/toast";
import Dropzone from "@/components/uploader/Dropzone";
import { ensureSeedTemplates, getTemplates, getTemplateById, type PromptTemplate } from "@/utils/prompts";

const TAGS: { value: ImageTag; label: string }[] = [
  { value: "façade-N", label: "Façade Nord" },
  { value: "façade-S", label: "Façade Sud" },
  { value: "façade-E", label: "Façade Est" },
  { value: "façade-O", label: "Façade Ouest" },
  { value: "toiture", label: "Toiture" },
  { value: "menuiseries", label: "Menuiseries" },
  { value: "réseaux", label: "Réseaux" },
  { value: "pathologies", label: "Pathologies" },
  { value: "autre", label: "Autre" },
];

const STATUSES: ProjectStatus[] = ["Brouillon", "En cours", "Terminé", "Archivé"];
const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25 Mo

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [prompt, setPrompt] = useState("");
  const [tagFilter, setTagFilter] = useState<"all" | ImageTag>("all");

  // Champs infos projet
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("Brouillon");
  const [notes, setNotes] = useState("");

  // Templates
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [projectTemplateId, setProjectTemplateId] = useState<string | undefined>(undefined);

  useEffect(() => {
    ensureSeedTemplates();
    setTemplates(getTemplates());
  }, []);

  useEffect(() => {
    if (!id) return;
    const p = getProjectById(id);
    setProject(p);
    setPrompt(p?.prompt ?? "");
    setTitle(p?.title ?? "");
    setAddress(p?.address ?? "");
    setType(p?.type ?? "");
    setStatus(p?.status ?? "Brouillon");
    setNotes(p?.notes ?? "");
    setProjectTemplateId(p?.templateId);
  }, [id]);

  const notFound = !project;

  const lineErrors = useMemo(() => {
    const errors: number[] = [];
    prompt.split("\n").forEach((line, idx) => {
      if (line.length > 100) errors.push(idx + 1);
    });
    return errors;
  }, [prompt]);

  const handleSavePrompt = () => {
    if (!project) return;
    if (lineErrors.length > 0) {
      showError(`Le prompt contient des lignes > 100 caractères (lignes: ${lineErrors.join(", ")}).`);
      return;
    }
    const updated = updateProject(project.id, { prompt });
    setProject(updated);
    showSuccess("Prompt enregistré");
  };

  const applyTemplateToPrompt = () => {
    if (!project || !projectTemplateId) return;
    const tpl = getTemplateById(projectTemplateId);
    if (!tpl) return;
    setPrompt(tpl.body);
    showSuccess("Template appliqué au prompt du projet");
  };

  const saveProjectTemplateSelection = () => {
    if (!project) return;
    const updated = updateProject(project.id, { templateId: projectTemplateId })!;
    setProject(updated);
    showSuccess("Template sélectionné au niveau projet");
  };

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!project || !files) return;
    const filesArr = Array.from(files as ArrayLike<File>);
    if (filesArr.length === 0) return;

    const accepted = filesArr.filter((f) => {
      const okType = ["image/jpeg", "image/png", "image/webp"].includes(f.type);
      const okSize = f.size <= MAX_IMAGE_SIZE;
      return okType && okSize;
    });
    if (accepted.length !== filesArr.length) {
      showError("Certaines images ont été ignorées (format ou taille > 25 Mo).");
    }
    const newImages: ProjectImage[] = [];
    for (const f of accepted) {
      const dataUrl = await fileToDataUrl(f);
      newImages.push({
        id: crypto.randomUUID(),
        name: f.name,
        size: f.size,
        type: f.type,
        dataUrl,
        createdAt: new Date().toISOString(),
      });
    }
    const updated = updateProject(project.id, { images: [...project.images, ...newImages] })!;
    setProject(updated);
    showSuccess(`${newImages.length} image(s) ajoutée(s)`);
  };

  const handleDeleteImage = (imgId: string) => {
    if (!project) return;
    const updated = updateProject(
      project.id,
      { images: project.images.filter((i) => i.id !== imgId) },
    )!;
    setProject(updated);
    showSuccess("Image supprimée");
  };

  const handleUpdateTag = (imgId: string, tag?: ImageTag) => {
    if (!project) return;
    const updated = updateProject(
      project.id,
      { images: project.images.map((i) => (i.id === imgId ? { ...i, tag } : i)) },
    )!;
    setProject(updated);
  };

  const handleUpdateImageTemplate = (imgId: string, templateId?: string) => {
    if (!project) return;
    const updated = updateProject(
      project.id,
      { images: project.images.map((i) => (i.id === imgId ? { ...i, templateId } : i)) },
    )!;
    setProject(updated);
    showSuccess("Template appliqué à l’image");
  };

  const moveImage = (imgId: string, direction: "left" | "right") => {
    if (!project) return;
    const idx = project.images.findIndex((i) => i.id === imgId);
    if (idx === -1) return;
    const newIndex = direction === "left" ? idx - 1 : idx + 1;
    if (newIndex < 0 || newIndex >= project.images.length) return;
    const next = [...project.images];
    const [moved] = next.splice(idx, 1);
    next.splice(newIndex, 0, moved);
    const updated = updateProject(project.id, { images: next })!;
    setProject(updated);
  };

  const filteredImages = useMemo(() => {
    if (!project) return [];
    return project.images.filter((img) => (tagFilter === "all" ? true : img.tag === tagFilter));
  }, [project, tagFilter]);

  const handleSaveInfos = () => {
    if (!project) return;
    const updated = updateProject(project.id, {
      title: title.trim() || "Sans titre",
      address: address.trim() || undefined,
      type: type.trim() || undefined,
      status,
      notes: notes.trim() || undefined,
    })!;
    setProject(updated);
    showSuccess("Informations du projet mises à jour");
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto w-full max-w-6xl px-4 py-6">
          <div className="rounded-lg border bg-card p-6">
            <p className="mb-4">Projet introuvable.</p>
            <Link to="/projects">
              <Button variant="secondary">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour aux projets
              </Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{project.title}</h1>
              <Badge variant="secondary">{project.status}</Badge>
              {project.type ? <Badge variant="outline">{project.type}</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">{project.address || "Adresse non renseignée"}</p>
          </div>
          <Link to="/projects">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Tous les projets
            </Button>
          </Link>
        </div>

        <Separator className="mb-6" />

        <Tabs defaultValue="images" className="w-full">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="images">Images</TabsTrigger>
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            <TabsTrigger value="infos">Infos</TabsTrigger>
            <TabsTrigger value="runs" disabled>Runs (à venir)</TabsTrigger>
          </TabsList>

          <TabsContent value="images" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Ajouter des images</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Dropzone
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onFiles={handleFiles}
                  label="Glissez-déposez vos images ici"
                  hint="ou cliquez pour sélectionner (JPG/PNG/WebP, 25 Mo max)"
                  className="w-full"
                />
                <div className="flex items-center gap-3">
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                  <Button type="button" variant="outline" onClick={() => document.getElementById("file-input-hidden")?.click()}>
                    <Upload className="mr-2 h-4 w-4" />
                    Parcourir
                  </Button>
                </div>
                <input
                  id="file-input-hidden"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <p className="text-xs text-muted-foreground">Formats: JPG/PNG/WebP • max 25 Mo/image</p>
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                {filteredImages.length} image{filteredImages.length > 1 ? "s" : ""} affichée{filteredImages.length > 1 ? "s" : ""}
                {tagFilter !== "all" ? ` (filtre: ${TAGS.find(t => t.value === tagFilter)?.label})` : ""}
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">Filtrer par tag</Label>
                <Select value={tagFilter} onValueChange={(v) => setTagFilter((v as ImageTag) || "all")}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Tous les tags" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    {TAGS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {project.images.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
                <ImageIcon className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground">Aucune image pour le moment.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredImages.map((img) => {
                  const idx = project.images.findIndex((i) => i.id === img.id);
                  const canLeft = idx > 0;
                  const canRight = idx < project.images.length - 1;
                  return (
                    <Card key={img.id} className="overflow-hidden">
                      <div className="relative aspect-video w-full bg-muted">
                        <img
                          src={img.dataUrl}
                          alt={img.name}
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      </div>
                      <CardContent className="space-y-2 pt-3">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{img.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {(img.size / 1024).toFixed(0)} Ko • {new Date(img.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" disabled={!canLeft} onClick={() => moveImage(img.id, "left")} title="Déplacer à gauche">
                              <ArrowLeftCircle className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" disabled={!canRight} onClick={() => moveImage(img.id, "right")} title="Déplacer à droite">
                              <ArrowRightCircle className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => handleDeleteImage(img.id)} title="Supprimer">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label className="text-xs">Tag</Label>
                          <Select
                            value={img.tag ?? ""}
                            onValueChange={(v) => handleUpdateTag(img.id, v as ImageTag)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choisir un tag" />
                            </SelectTrigger>
                            <SelectContent>
                              {TAGS.map((t) => (
                                <SelectItem key={t.value} value={t.value}>
                                  {t.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid gap-2">
                          <Label className="text-xs">Template (image)</Label>
                          <Select
                            value={img.templateId ?? "inherit"}
                            onValueChange={(v) => handleUpdateImageTemplate(img.id, v === "inherit" ? undefined : v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Hérite du template projet" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="inherit">Hériter du projet</SelectItem>
                              {templates.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                      <CardFooter></CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="prompt" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Prompt maître (projet)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Template (projet)</Label>
                    <Select value={projectTemplateId ?? "none"} onValueChange={(v) => setProjectTemplateId(v === "none" ? undefined : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un template" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Aucun (libre)</SelectItem>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={saveProjectTemplateSelection}>Enregistrer le template</Button>
                      <Button variant="secondary" onClick={applyTemplateToPrompt}>Appliquer au prompt</Button>
                    </div>
                  </div>
                </div>

                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={`Exemple de structure:
Constat technique:
- ...
Solutions correctives:
- ...
Conformité réglementaire:
- ...`}
                  rows={12}
                />
                {lineErrors.length > 0 ? (
                  <p className="text-sm text-destructive">
                    Lignes trop longues (&gt; 100 caractères) : {lineErrors.join(", ")}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Règle: chaque ligne ≤ 100 caractères.
                  </p>
                )}
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button onClick={handleSavePrompt}>Enregistrer</Button>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="infos" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Informations du projet</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="title">Titre</Label>
                  <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="status">Statut</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                    <SelectTrigger id="status">
                      <SelectValue placeholder="Choisir un statut" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="address">Adresse</Label>
                  <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="type">Type de bâti</Label>
                  <Input id="type" value={type} onChange={(e) => setType(e.target.value)} placeholder="Pavillon, immeuble, ..." />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes internes, remarques, contexte..." />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button onClick={handleSaveInfos}>Enregistrer</Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default ProjectDetail;