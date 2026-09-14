import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download } from "lucide-react";

const links = [
  {
    label: "Dataset PIA VISION (.zip)",
    url: "https://www.dropbox.com/scl/fi/t6ph2figcp2yiffwwmz6m/dataset_visio_ai.zip?rlkey=edsgvku4otcpuph4xyxtoo7ac&dl=0",
    hint: "Archive contenant les images d'entraînement (train / val / test)",
  },
  {
    label: "Modèle ONNX v2",
    url: "https://www.dropbox.com/scl/fi/4v0rspxuts5eoghmjh0nx/model_v2.onnx?rlkey=m8fr844jdk0ylce7u0215bwqr&dl=0",
    hint: "Fichier .onnx à importer dans la section ci-dessous",
  },
];

const DownloadLinksCard = () => (
  <Card className="rounded-3xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Download className="h-5 w-5" />
        Première utilisation
      </CardTitle>
      <CardDescription className="text-white/70">
        Téléchargez les fichiers nécessaires avant de configurer le dataset et le modèle.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      {links.map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
        >
          <Download className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
          <div>
            <p className="text-sm font-semibold">{l.label}</p>
            <p className="text-xs text-white/50">{l.hint}</p>
          </div>
        </a>
      ))}
    </CardContent>
  </Card>
);

export default DownloadLinksCard;
