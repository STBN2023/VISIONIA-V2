import { MadeWithDyad } from "@/components/made-with-dyad";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center px-4 py-24 text-center">
        <h1 className="mb-3 text-4xl font-bold">Analyse photo pour rénovation énergétique</h1>
        <p className="mb-6 max-w-2xl text-muted-foreground">
          Créez un projet, importez vos images, éditez le prompt et préparez l’orchestration d’analyse.
        </p>
        <div className="flex gap-3">
          <Link to="/projects">
            <Button>Accéder aux projets</Button>
          </Link>
        </div>
        <div className="mt-12">
          <MadeWithDyad />
        </div>
      </main>
    </div>
  );
};

export default Index;