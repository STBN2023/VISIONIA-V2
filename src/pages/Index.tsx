import React, { useEffect, useState } from "react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import GlassPanel from "@/components/ui/GlassPanel";
import { GlassShell } from "@/components/layout/GlassShell";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const Index = () => {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Use getSession (reads from cache/memory) instead of getUser (network call)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/login');
      }
      // Settings are already loaded by SettingsContext — no need to duplicate here
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session && event !== 'INITIAL_SESSION') {
        navigate('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 text-white/60 animate-spin" />
      </div>
    );
  }

  return (
    <GlassShell>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center px-4 py-20">
        <GlassPanel className="mx-auto max-w-3xl text-center">
          <h1 className="mb-3 text-4xl font-bold">PIA VISION — Analyse des images</h1>
          <p className="mb-6 text-muted-foreground">
            Créez un projet, importez vos images, éditez le modèle d'analyse et préparez l'orchestration de vos compte-rendu.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/projects">
              <Button className="backdrop-blur-sm">Accéder aux projets</Button>
            </Link>
          </div>
          <div className="mt-8">
            <MadeWithDyad />
          </div>
        </GlassPanel>
      </main>
    </GlassShell>
  );
};

export default Index;
