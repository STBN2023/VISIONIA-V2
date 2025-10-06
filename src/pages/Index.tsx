import { MadeWithDyad } from "@/components/made-with-dyad";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import GlassPanel from "@/components/ui/GlassPanel";
import { GlassShell } from "@/components/layout/GlassShell";

const Index = () => {
  return (
    <GlassShell>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center px-4 py-20">
        <GlassPanel className="mx-auto max-w-3xl text-center">
          <h1 className="mb-3 text-4xl font-bold">Analyse Photo Chantier</h1>
          <p className="mb-6 text-muted-foreground">
            Créez un projet, importez vos images, éditez le prompt et préparez l'orchestration d'analyse.
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