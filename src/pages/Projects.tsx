import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ProjectFormDialog from "@/components/projects/ProjectFormDialog";
import { AppHeader } from "@/components/layout/AppHeader";
import { getProjects, createProject, deleteProject, type Project } from "@/utils/storage";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FolderClosed, Trash2 } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import { GlassShell } from "@/components/layout/GlassShell";

const Projects = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const list = await getProjects();
      setProjects(list);
    })();
  }, []);

  const totalCount = projects.length;
  const subtitle = useMemo(
    () => (totalCount > 0 ? `${totalCount} projet${totalCount > 1 ? "s" : ""}` : "Aucun projet pour le moment"),
    [totalCount],
  );

  const handleCreate = async (data: { title: string; address?: string; type?: string }) => {
    try {
      const p = await createProject(data);
      const list = await getProjects();
      setProjects(list);
      showSuccess("Projet créé");
      setCreateOpen(false);
      navigate(`/projects/${p.id}`);
    } catch (e: any) {
      const msg = e?.message || "Erreur lors de la création du projet";
      showError(msg);
      throw e;
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce projet ?")) return;
    await deleteProject(id);
    const list = await getProjects();
    setProjects(list);
    showSuccess("Projet supprimé");
  };

  return (
    <GlassShell>
      <AppHeader onCreateProjectClick={() => setCreateOpen(true)} />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between text-white">
          <div>
            <h1 className="text-2xl font-semibold">Projets</h1>
            <p className="text-sm text-white/70">{subtitle}</p>
          </div>
          <ProjectFormDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
        </div>
        <Separator className="mb-6 border-white/20" />
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/20 bg-white/5 py-16 text-center backdrop-blur-xl">
            <FolderClosed className="mb-3 h-8 w-8 text-white/70" />
            <p className="mb-4 text-white/80">Créez votre premier projet pour démarrer l’analyse.</p>
            <ProjectFormDialog onCreate={handleCreate} triggerLabel="Créer un projet" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <Card key={p.id} className="flex flex-col rounded-3xl border-white/20 bg-white/10 text-white shadow-2xl backdrop-blur-2xl">
                <CardHeader className="pb-2">
                  <CardTitle className="line-clamp-1">{p.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 space-y-2">
                  <div className="text-sm text-white/80 line-clamp-2">{p.address || "Adresse non renseignée"}</div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{p.status}</Badge>
                    {p.type ? <Badge variant="outline">{p.type}</Badge> : null}
                  </div>
                </CardContent>
                <CardFooter className="flex items-center justify-between">
                  <Link to={`/projects/${p.id}`}>
                    <Button size="sm" className="backdrop-blur-sm">Ouvrir</Button>
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)} className="text-white/90 hover:bg-white/10">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Supprimer
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>
    </GlassShell>
  );
};

export default Projects;