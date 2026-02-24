import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import ProjectHeader from "@/components/projects/ProjectHeader";
import ImagesTab from "@/components/projects/tabs/ImagesTab";
import PromptTab from "@/components/projects/tabs/PromptTab";
import InfoTab from "@/components/projects/tabs/InfoTab";
import RunsTab from "@/components/runs/RunsTab";
import { getProjectById, updateProject, type Project, type ProjectImage, fileToDataUrl, type ImageTag, type ProjectStatus } from "@/utils/storage";
import { ensureSeedTemplates, getTemplates, getTemplateById, type PromptTemplate } from "@/utils/prompts";
import { getRunsByProjectId, type Run } from "@/utils/runs";
import { showError, showSuccess } from "@/utils/toast";
import { Button } from "@/components/ui/button";
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { compressImageToBlob, blobToDataUrl } from "@/utils/image-compress";
import { GlassShell } from "@/components/layout/GlassShell";

const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25 Mo
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Ajout: utilitaires pour formatage des noms
const sanitizeToFileBase = (input: string) => {
  const base = (input || "Sans titre").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return base.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
};
const formatDateDDMMYYYY = (d: Date) => {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}${mm}${yyyy}`;
};
const extFromMime = (mime: string) => {
  switch (mime) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    default:
      return ".jpg";
  }
};

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
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

  // Runs
  const [runs, setRuns] = useState<Run[]>([]);

  useEffect(() => {
    ensureSeedTemplates();
    setTemplates(getTemplates());
  }, []);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const p = await getProjectById(id);
      if (p) {
        setProject(p);
        setPrompt(p.prompt || "");
        setTitle(p.title || "");
        setAddress(p.address || "");
        setType(p.type || "");
        setStatus(p.status || "Brouillon");
        setNotes(p.notes || "");
        setProjectTemplateId(p.templateId);
        setRuns(getRunsByProjectId(p.id));
      }
    })();
  }, [id]);

  // Poll simple pour suivre la progression des runs
  useEffect(() => {
    if (!project) return;
    const interval = setInterval(() => {
      setRuns(getRunsByProjectId(project.id));
    }, 1000);
    return () => clearInterval(interval);
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const notFound = !project;

  const lineErrors = useMemo(() => {
    const errors: number[] = [];
    prompt.split("\n").forEach((line, idx) => {
      if (line.length > 100) errors.push(idx + 1);
    });
    return errors;
  }, [prompt]);

  // Actions prompt/template
  const handleProjectTemplateChange = async (templateId: string | undefined) => {
    setProjectTemplateId(templateId);
    if (!project) return;
    
    if (templateId) {
      const tpl = getTemplateById(templateId);
      if (tpl) {
        setPrompt(tpl.body);
        // Auto-save the selection to the project in DB
        const updated = await updateProject(project.id, { templateId, prompt: tpl.body });
        if (updated) setProject(updated);
        showSuccess("Modèle chargé et appliqué au projet");
      }
    } else {
      const updated = await updateProject(project.id, { templateId: undefined });
      if (updated) setProject(updated);
    }
  };

  const handlePromptChange = async (newPrompt: string) => {
    setPrompt(newPrompt);
    if (project) {
      await updateProject(project.id, { prompt: newPrompt });
    }
  };

  const applyTemplateToPrompt = async () => {
    if (!project || !projectTemplateId) return;
    const tpl = getTemplateById(projectTemplateId);
    if (!tpl) return;
    setPrompt(tpl.body);
    const updated = await updateProject(project.id, { prompt: tpl.body });
    if (updated) setProject(updated);
    showSuccess("Template appliqué au prompt du projet");
  };

  const saveProjectTemplateSelection = async () => {
    if (!project) return;
    const updated = await updateProject(project.id, { templateId: projectTemplateId })!;
    setProject(updated);
    showSuccess("Template sélectionné au niveau projet");
  };

  // Actions tags projet
  const handleCreateTag = async (label: string) => {
    if (!project) return;
    const nextTags = Array.from(new Set([...(project.tags || []), label])).sort((a, b) =>
      a.localeCompare(b),
    );
    const updated = await updateProject(project.id, { tags: nextTags })!;
    setProject(updated);
    showSuccess(`Tag "${label}" ajouté au projet`);
  };

  const handleDeleteTag = async (label: string) => {
    if (!project) return;
    const nextTags = (project.tags || []).filter((t) => t !== label);
    // Enlever le tag des images qui l'utilisent
    const nextImages = project.images.map((i) => (i.tag === label ? { ...i, tag: undefined } : i));
    const updated = await updateProject(project.id, { tags: nextTags, images: nextImages })!;
    setProject(updated);
    if (tagFilter === label) setTagFilter("all");
    showSuccess(`Tag "${label}" supprimé`);
  };

  // Actions images (avec compression)
  const handleFiles = async (files: FileList | File[] | null) => {
    if (!project || !files) return;
    const filesArr = Array.from(files as ArrayLike<File>);
    if (filesArr.length === 0) return;

    let ignoredWrongType = 0;
    let ignoredTooLarge = 0;
    let compressedCount = 0;

    const newImages: ProjectImage[] = [];
    const baseName = sanitizeToFileBase(project.title || "Sans titre");
    const importDate = new Date();
    const dateStr = formatDateDDMMYYYY(importDate);
    const startIndex = (project.images?.length || 0) + 1;

    for (let idx = 0; idx < filesArr.length; idx++) {
      const f = filesArr[idx];
      // Type accepté
      if (!ALLOWED_TYPES.includes(f.type)) {
        ignoredWrongType++;
        continue;
      }

      // Compresse systématiquement
      let outBlob: Blob;
      try {
        outBlob = await compressImageToBlob(f, {
          maxWidth: 2000,
          maxHeight: 2000,
          quality: 0.82,
          convertTo: "image/webp",
        });
      } catch {
        outBlob = f;
      }

      let finalBlob = f as Blob;
      let usedCompressed = false;

      if (f.size > MAX_IMAGE_SIZE) {
        if (outBlob.size <= MAX_IMAGE_SIZE) {
          finalBlob = outBlob;
          usedCompressed = true;
        } else {
          ignoredTooLarge++;
          continue;
        }
      } else {
        if (outBlob.size + 1024 < f.size) {
          finalBlob = outBlob;
          usedCompressed = true;
        } else {
          finalBlob = f;
        }
      }

      if (finalBlob.size > MAX_IMAGE_SIZE) {
        ignoredTooLarge++;
        continue;
      }

      if (usedCompressed) compressedCount++;

      let dataUrl: string;
      if (finalBlob === f) {
        dataUrl = await fileToDataUrl(f);
      } else {
        dataUrl = await blobToDataUrl(finalBlob);
      }

      const finalType = (finalBlob.type as string) || f.type || "image/webp";
      const ext = extFromMime(finalType);
      const increment = startIndex + idx;
      const generatedName = `${baseName}_${dateStr}_${increment}${ext}`;

      const img: ProjectImage = {
        id: crypto.randomUUID(),
        name: generatedName,
        size: finalBlob.size,
        type: finalType,
        dataUrl,
        createdAt: new Date().toISOString(),
      };
      newImages.push(img);
    }

    if (newImages.length === 0) {
      if (ignoredWrongType || ignoredTooLarge) {
        const parts: string[] = [];
        if (ignoredWrongType) parts.push(`${ignoredWrongType} format(s) non supporté(s)`);
        if (ignoredTooLarge) parts.push(`${ignoredTooLarge} trop lourde(s) après compression`);
        showError(`Aucune image ajoutée (${parts.join(", ")}).`);
      }
      return;
    }

    const updated = await updateProject(project.id, { images: [...project.images, ...newImages] })!;
    setProject(updated);

    const added = newImages.length;
    const ignoredMsg =
      ignoredWrongType || ignoredTooLarge
        ? ` • ignorées: ${ignoredWrongType} format(s), ${ignoredTooLarge} trop lourde(s)`
        : "";
    const compressedMsg = compressedCount ? ` • compressées: ${compressedCount}` : "";
    showSuccess(`${added} image(s) ajoutée(s)${compressedMsg}${ignoredMsg}`);
  };

  const handleDeleteImage = async (imgId: string) => {
    if (!project) return;
    const updated = await updateProject(project.id, { images: project.images.filter((i) => i.id !== imgId) })!;
    setProject(updated);
    showSuccess("Image supprimée");
  };

  const handleUpdateTag = async (imgId: string, tag?: ImageTag) => {
    if (!project) return;
    const updated = await updateProject(project.id, {
      images: project.images.map((i) => (i.id === imgId ? { ...i, tag } : i)),
    })!;
    setProject(updated);
  };

  // Mise à jour de tags en masse (patch unique)
  const handleBulkUpdateTags = async (ids: string[], tag?: ImageTag) => {
    if (!project || ids.length === 0) return;
    const updated = await updateProject(project.id, {
      images: project.images.map((i) => (ids.includes(i.id) ? { ...i, tag } : i)),
    })!;
    setProject(updated);
  };

  // Appliquer un patch id -> tag en une seule fois (évite les états périmés)
  const handleApplyTagsPatch = async (patchMap: Record<string, ImageTag | undefined>) => {
    if (!project) return;
    const nextImages = project.images.map((i) =>
      Object.prototype.hasOwnProperty.call(patchMap, i.id) ? { ...i, tag: patchMap[i.id] } : i
    );
    const updated = await updateProject(project.id, { images: nextImages })!;
    setProject(updated);
  };

  const handleUpdateImages = async (newImages: ProjectImage[]) => {
    if (!project) return;
    const updated = await updateProject(project.id, { images: newImages })!;
    setProject(updated);
  };

  // Nouvelle version atomique: création de tags + patch images en UNE seule écriture
  const handleApplyTagsBatch = async (input: { createTags: string[]; patch: Record<string, ImageTag | undefined> }) => {
    if (!project) return;
    const createTags = Array.from(new Set((input.createTags || []).map((t) => t.trim()).filter(Boolean)));
    const nextTags = Array.from(new Set([...(project.tags || []), ...createTags])).sort((a, b) => a.localeCompare(b));

    const nextImages = project.images.map((i) =>
      Object.prototype.hasOwnProperty.call(input.patch, i.id) ? { ...i, tag: input.patch[i.id] } : i
    );

    const updated = await updateProject(project.id, { tags: nextTags, images: nextImages })!;
    setProject(updated);
  };

  const handleUpdateImageTemplate = async (imgId: string, templateId?: string) => {
    if (!project) return;
    const updated = await updateProject(project.id, {
      images: project.images.map((i) => (i.id === imgId ? { ...i, templateId } : i)),
    })!;
    setProject(updated);
    showSuccess("Template appliqué à l'image");
  };

  const moveImage = async (imgId: string, direction: "left" | "right") => {
    if (!project) return;
    const idx = project.images.findIndex((i) => i.id === imgId);
    if (idx === -1) return;
    const newIndex = direction === "left" ? idx - 1 : idx + 1;
    if (newIndex < 0 || newIndex >= project.images.length) return;
    const next = [...project.images];
    const [moved] = next.splice(idx, 1);
    next.splice(newIndex, 0, moved);
    const updated = await updateProject(project.id, { images: next })!;
    setProject(updated);
  };

  // Actions infos projet
  const handleSaveInfos = async () => {
    if (!project) return;
    const updated = await updateProject(project.id, {
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
      <GlassShell>
        <AppHeader />
        <main className="mx-auto w-full max-w-6xl px-4 py-6 text-white">
          <Card className="rounded-3xl border-white/20 bg-white/10 p-6 backdrop-blur-2xl">
            <p className="mb-4">Projet introuvable.</p>
            <Link to="/projects">
              <Button variant="secondary" className="backdrop-blur-sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour aux projets
              </Button>
            </Link>
          </Card>
        </main>
      </GlassShell>
    );
  }

  return (
    <GlassShell>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 text-white">
        <ProjectHeader project={project} />
        <Separator className="mb-6 border-white/20" />
        <Tabs defaultValue="images" className="w-full">
          <TabsList className="flex flex-wrap bg-white/10 text-white">
            <TabsTrigger value="images">Images</TabsTrigger>
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            <TabsTrigger value="infos">Infos</TabsTrigger>
            <TabsTrigger value="runs">Runs</TabsTrigger>
          </TabsList>

          <TabsContent value="images">
            <ImagesTab
              project={project}
              templates={templates}
              tagFilter={tagFilter}
              setTagFilter={setTagFilter}
              onAddFiles={handleFiles}
              onDeleteImage={handleDeleteImage}
              onUpdateTag={handleUpdateTag}
              onBulkUpdateTags={handleBulkUpdateTags}
              onUpdateImageTemplate={handleUpdateImageTemplate}
              onMoveImage={moveImage}
              onCreateTag={handleCreateTag}
              onDeleteTag={handleDeleteTag}
              onApplyTagsPatch={handleApplyTagsPatch}
              onApplyTagsBatch={handleApplyTagsBatch}
              onUpdateImages={handleUpdateImages}
            />
          </TabsContent>

          <TabsContent value="prompt">
            <PromptTab
              projectId={project.id}
              images={project.images}
              prompt={prompt}
              setPrompt={handlePromptChange}
              templates={templates}
              projectTemplateId={projectTemplateId}
              setProjectTemplateId={handleProjectTemplateChange}
              lineErrors={lineErrors}
              onApplyTemplateToPrompt={applyTemplateToPrompt}
              onSaveProjectTemplateSelection={saveProjectTemplateSelection}
              tags={project.tags || []}
            />
          </TabsContent>

          <TabsContent value="infos">
            <InfoTab
              title={title}
              setTitle={setTitle}
              status={status}
              setStatus={setStatus}
              address={address}
              setAddress={setAddress}
              type={type}
              setType={setType}
              notes={notes}
              setNotes={setNotes}
              onSaveInfos={handleSaveInfos}
            />
          </TabsContent>

          <TabsContent value="runs">
            <RunsTab runs={runs} images={project.images} />
          </TabsContent>
        </Tabs>
      </main>
    </GlassShell>
  );
};

export default ProjectDetail;