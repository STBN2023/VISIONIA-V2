import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { FolderClosed, Plus, Settings as SettingsIcon, FileText, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import BrandLogo from "@/components/branding/BrandLogo";
import { supabase } from "@/integrations/supabase/client";

const NavItem = ({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }> | null;
}) => {
  const location = useLocation();
  const active = location.pathname === to || location.pathname.startsWith(to + "/");
  return (
    <NavLink
      to={to}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors",
        active
          ? "bg-white/20 text-white shadow-sm backdrop-blur-md"
          : "text-white/80 hover:text-white hover:bg-white/15 backdrop-blur-sm",
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
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="flex items-center justify-between rounded-3xl border border-white/20 bg-white/10 px-4 py-3 shadow-2xl backdrop-blur-2xl">
          <Link to="/" className="flex items-center gap-2 text-base font-semibold text-white">
            <BrandLogo height={32} />
            <span>ISOEDRE Vision IA</span>
          </Link>
          <nav className="flex items-center gap-1">
            <NavItem to="/projects" label="Projets" icon={FolderClosed} />
            <NavItem to="/prompts" label="Prompts" icon={FileText} />
            <NavItem to="/settings" label="Paramètres" icon={SettingsIcon} />
          </nav>
          <div className="flex items-center gap-2">
            {onCreateProjectClick ? (
              <Button size="sm" className="backdrop-blur-sm" onClick={onCreateProjectClick}>
                <Plus className="mr-2 h-4 w-4" />
                <span>Nouveau projet</span>
              </Button>
            ) : (
              <Link to="/projects">
                <Button size="sm" className="backdrop-blur-sm">
                  <FolderClosed className="mr-2 h-4 w-4" />
                  Voir les projets
                </Button>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-white/70 hover:bg-white/10 hover:text-white"
              onClick={handleLogout}
              title="Déconnexion"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};