import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { Project } from "@/utils/storage";

type Props = {
  project: Project;
};

const ProjectHeader = ({ project }: Props) => {
  return (
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
  );
};

export default ProjectHeader;