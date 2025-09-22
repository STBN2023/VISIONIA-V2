import { Link, NavLink, useLocation } from "react-router-dom";
import { FolderClosed, Plus, Settings as SettingsIcon, FileText } from "lucide-react";
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
        active
          ? "bg-white/50 text-foreground shadow-sm backdrop-blur-md dark:bg-white/10"
          : "text-muted-foreground hover:text-foreground hover:bg-white/40 backdrop-blur-sm dark:hover:bg-white/10",
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
    <header className="sticky top-0 z-40 w-full border-b border-white/20 bg-background/60 backdrop-blur-md supports-[backdrop-filter]:bg-background/50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-base font-semibold">
          Rénov’ IA
        </Link>
        <nav className="flex items-center gap-1">
          <NavItem to="/projects" label="Projets" icon={FolderClosed} />
          <NavItem to="/prompts" label="Prompts" icon={FileText} />
          <NavItem to="/settings" label="Paramètres" icon={SettingsIcon} />
        </nav>
        <div className="flex items-center gap-2">
          {onCreateProjectClick ? (
            <Button size="sm" className="backdrop-blur-sm">
              <Plus className="mr-2 h-4 w-4" />
              <span onClick={onCreateProjectClick}>Nouveau projet</span>
            </Button>
          ) : (
            <Link to="/projects">
              <Button size="sm" className="backdrop-blur-sm">
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