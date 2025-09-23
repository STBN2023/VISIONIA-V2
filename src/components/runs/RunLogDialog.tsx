"use client";

import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import GlassDialogContent from "@/components/glass/GlassDialogContent";
import type { Run } from "@/utils/runs";

type Props = {
  run: Run | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const RunLogDialog = ({ run, open, onOpenChange }: Props) => {
  const failedItems = (run?.items || []).filter((i) => i.status === "failed" || !!i.error);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <GlassDialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Journal d’exécution</DialogTitle>
          <DialogDescription>Détails sur l’échec et informations de diagnostic.</DialogDescription>
        </DialogHeader>

        {!run ? (
          <div className="rounded-xl border border-white/20 bg-white/10 p-4 text-white/80">
            Aucune donnée de run.
          </div>
        ) : (
          <div className="space-y-4 text-white">
            <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm">
              <div className="mb-1">Run: {run.id}</div>
              <div className="mb-1">Projet: {run.projectId}</div>
              <div className="mb-1">Mode: {run.mode === "aggregate" ? "Agrégé" : "Par image"}</div>
              <div className="mb-1">Statut: {run.status}</div>
              <div className="text-white/70">
                Créé: {new Date(run.createdAt).toLocaleString()}
                {run.updatedAt ? ` • MAJ: ${new Date(run.updatedAt).toLocaleString()}` : null}
              </div>
            </div>

            {run.error ? (
              <div className="rounded-xl border border-red-400/30 bg-red-500/15 p-4 text-sm">
                <div className="mb-1 font-semibold text-red-200">Erreur générale</div>
                <div className="text-red-100/90 whitespace-pre-wrap">{run.error}</div>
              </div>
            ) : null}

            {run.mode === "per_image" ? (
              <div className="space-y-2">
                <div className="text-sm text-white/80">
                  Erreurs par image {failedItems.length > 0 ? `(${failedItems.length})` : ""}
                </div>
                {failedItems.length === 0 ? (
                  <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-white/70">
                    Aucune erreur détaillée n’a été enregistrée pour les images.
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {failedItems.map((it) => (
                      <div key={it.id} className="rounded-xl border border-white/15 bg-white/5 p-3 text-sm">
                        <div className="mb-1 font-medium">Image ID: {it.imageId}</div>
                        <div className="whitespace-pre-wrap text-white/80">
                          {it.error || "Échec sans message d’erreur explicite."}
                        </div>
                        {it.startedAt || it.finishedAt ? (
                          <div className="mt-2 text-xs text-white/60">
                            {it.startedAt ? `Début: ${new Date(it.startedAt).toLocaleString()}` : ""}
                            {it.finishedAt ? ` • Fin: ${new Date(it.finishedAt).toLocaleString()}` : ""}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {!run.error && failedItems.length === 0 ? (
              <div className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-white/80">
                Aucune erreur enregistrée. Si le statut est “failed” sans message, vérifiez:
                - la clé API (Paramètres), le modèle et le quota,
                - la taille/quantité d’images (limite 12 envoyées),
                - votre connexion réseau.
              </div>
            ) : null}
          </div>
        )}
      </GlassDialogContent>
    </Dialog>
  );
};

export default RunLogDialog;