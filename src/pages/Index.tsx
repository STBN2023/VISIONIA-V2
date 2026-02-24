import React, { useEffect, useState } from "react";
import { MadeWithDyad } from "@/components/made-with-dyad";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import GlassPanel from "@/components/ui/GlassPanel";
import { GlassShell } from "@/components/layout/GlassShell";
import { supabase } from "@/integrations/supabase/client";
import { loadSettingsFromCloud } from "@/utils/settings";

const Index = () => {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        navigate('/login');
      } else {
        // Charger les réglages depuis le cloud dès que la session est OK
        await loadSettingsFromCloud();
      }
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
    return <div className="flex h-screen items-center justify-center">Chargement...</div>;
  }

  return (
    <GlassShell>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center px-4 py-20">
        <GlassPanel className="mx-auto max-w-3xl text-center">
          <h1 className="mb-3 text-4xl font-bold">Vision IA - Analyse des images</h1>
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