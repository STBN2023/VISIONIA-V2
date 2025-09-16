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
import { showSuccess } from "@/utils/toast";

const Projects = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    setProjects(getProjects());
  }, []);

  const totalCount = projects.length;
  const subtitle = useMemo(
    () => (totalCount > 0 ? `${totalCount} projet${totalCount > 1 ? "s" : ""}` : "Aucun projet pour le moment"),
    [totalCount],
  );

  const handleCreate = (data: { title: string; address?: string; type?: string }) => {
    const p = createProject(data);
    setProjects(getProjects());
    showSuccess("Projet créé");
    navigate(`/projects/${p.id}`);
  };

  const handleDelete = (id: string) => {
    // Confirmation simple pour éviter les erreurs
    if (!confirm("Supprimer ce projet ?")) return;
    deleteProject(id);
    setProjects(getProjects());
    showSuccess("Projet supprimé");
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader onCreateProjectClick={() => { /* ouvert via dialog dédié plus bas */ }} />
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Projets</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <ProjectFormDialog onCreate={handleCreate} />
        </div>
        <Separator className="mb-6" />
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
            <FolderClosed className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="mb-4 text-muted-foreground">
              Créez votre premier projet pour démarrer l’analyse.
            </p>
            <ProjectFormDialog onCreate={handleCreate} triggerLabel="Créer un projet" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <Card key={p.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="line-clamp-1">{p.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 space-y-2">
                  <div className="text-sm text-muted-foreground line-clamp-2">{p.address || "Adresse non renseignée"}</div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{p.status}</Badge>
                    {p.type ? <Badge variant="outline">{p.type}</Badge> : null}
                  </div>
                </CardContent>
                <CardFooter className="flex items-center justify-between">
                  <Link to={`/projects/${p.id}`}>
                    <Button size="sm">Ouvrir</Button>
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Supprimer
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Projects;