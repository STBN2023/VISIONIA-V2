import { Link, NavLink, useLocation } from "react-router-dom";
import { FolderClosed, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NavItem = ({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}) => {
  const location = useLocation();
  const active = location.pathname === to || location.pathname.startsWith(to + "/");
  return (
    <NavLink
      to={to}
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {label}
    </NavLink>
  );
};

export const AppHeader = ({
  onCreateProjectClick,
}: {
  onCreateProjectClick?: () => void;
}) => {
  return (
    <header className="w-full border-b bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-base font-semibold">
          Rénov’ IA
        </Link>
        <nav className="flex items-center gap-1">
          <NavItem to="/projects" label="Projets" icon={FolderClosed} />
        </nav>
        <div className="flex items-center gap-2">
          {onCreateProjectClick ? (
            <Button size="sm" onClick={onCreateProjectClick}>
              <Plus className="mr-2 h-4 w-4" />
              Nouveau projet
            </Button>
          ) : (
            <Link to="/projects">
              <Button size="sm">
                <FolderClosed className="mr-2 h-4 w-4" />
                Voir les projets
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};