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

const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25 Mo

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
      setProject(p);
      setPrompt(p?.prompt ?? "");
      setTitle(p?.title ?? "");
      setAddress(p?.address ?? "");
      setType(p?.type ?? "");
      setStatus(p?.status ?? "Brouillon");
      setNotes(p?.notes ?? "");
      setProjectTemplateId(p?.templateId);
      setRuns(p ? getRunsByProjectId(p.id) : []);
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
  const applyTemplateToPrompt = () => {
    if (!project || !projectTemplateId) return;
    const tpl = getTemplateById(projectTemplateId);
    if (!tpl) return;
    setPrompt(tpl.body);
    showSuccess("Template appliqué au prompt du projet");
  };

  const saveProjectTemplateSelection = async () => {
    if (!project) return;
    const updated = await updateProject(project.id, { templateId: projectTemplateId })!;
    setProject(updated);
    showSuccess("Template sélectionné au niveau projet");
  };

  // Actions images
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
    const updated = await updateProject(project.id, { images: [...project.images, ...newImages] })!;
    setProject(updated);
    showSuccess(`${newImages.length} image(s) ajoutée(s)`);
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

  const handleUpdateImageTemplate = async (imgId: string, templateId?: string) => {
    if (!project) return;
    const updated = await updateProject(project.id, {
      images: project.images.map((i) => (i.id === imgId ? { ...i, templateId } : i)),
    })!;
    setProject(updated);
    showSuccess("Template appliqué à l’image");
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
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto w-full max-w-6xl px-4 py-6">
          <Card className="p-6">
            <p className="mb-4">Projet introuvable.</p>
            <Link to="/projects">
              <Button variant="secondary">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour aux projets
              </Button>
            </Link>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <ProjectHeader project={project} />
        <Separator className="mb-6" />
        <Tabs defaultValue="images" className="w-full">
          <TabsList className="flex flex-wrap">
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
              onUpdateImageTemplate={handleUpdateImageTemplate}
              onMoveImage={moveImage}
            />
          </TabsContent>

          <TabsContent value="prompt">
            <PromptTab
              projectId={project.id}
              images={project.images}
              prompt={prompt}
              setPrompt={setPrompt}
              templates={templates}
              projectTemplateId={projectTemplateId}
              setProjectTemplateId={setProjectTemplateId}
              lineErrors={lineErrors}
              onApplyTemplateToPrompt={applyTemplateToPrompt}
              onSaveProjectTemplateSelection={saveProjectTemplateSelection}
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
    </div>
  );
};

export default ProjectDetail;