import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { GlassShell } from "@/components/layout/GlassShell";
import GlassPanel from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404: route introuvable →", location.pathname);
  }, [location.pathname]);

  return (
    <GlassShell>
      <AppHeader />
      <main className="mx-auto flex min-h-[70vh] w-full max-w-6xl items-center justify-center px-4 py-10 text-white">
        <GlassPanel className="text-center">
          <h1 className="mb-2 text-4xl font-bold">404</h1>
          <p className="mb-6 text-white/80">Page introuvable</p>
          <Link to="/">
            <Button variant="secondary" className="backdrop-blur-sm">Retour à l’accueil</Button>
          </Link>
        </GlassPanel>
      </main>
    </GlassShell>
  );
};

export default NotFound;