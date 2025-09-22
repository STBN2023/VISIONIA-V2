import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { GlassShell } from "@/components/layout/GlassShell";
import GlassPanel from "@/components/ui/GlassPanel";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <GlassShell>
      <AppHeader />
      <main className="mx-auto flex min-h-[70vh] w-full max-w-6xl items-center justify-center px-4 py-10 text-white">
        <GlassPanel className="text-center">
          <h1 className="mb-2 text-4xl font-bold">404</h1>
          <p className="mb-4 text-white/80">Oops! Page not found</p>
          <a href="/" className="text-white underline underline-offset-4 hover:text-white/90">
            Return to Home
          </a>
        </GlassPanel>
      </main>
    </GlassShell>
  );
};

export default NotFound;