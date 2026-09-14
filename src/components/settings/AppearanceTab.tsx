import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { type BackgroundMode, type BackgroundFit, type ThemePreset } from "@/utils/settings";
import { compressImageToBlob, blobToDataUrl } from "@/utils/image-compress";
import { uploadUserAsset } from "@/utils/upload";
import { showSuccess, showError } from "@/utils/toast";
import { supabase } from "@/integrations/supabase/client";

interface AppearanceTabProps {
  backgroundMode: BackgroundMode;
  setBackgroundMode: (v: BackgroundMode) => void;
  backgroundImage: string;
  setBackgroundImage: (v: string) => void;
  backgroundColor: string;
  setBackgroundColor: (v: string) => void;
  backgroundDim: number;
  setBackgroundDim: (v: number) => void;
  backgroundFit: BackgroundFit;
  setBackgroundFit: (v: BackgroundFit) => void;
  backgroundScale: number;
  setBackgroundScale: (v: number) => void;
  themePreset: ThemePreset;
  setThemePreset: (v: ThemePreset) => void;
  brightness: number;
  setBrightness: (v: number) => void;
  onSave: () => void;
}

export function AppearanceTab({
  backgroundMode, setBackgroundMode,
  backgroundImage, setBackgroundImage,
  backgroundColor, setBackgroundColor,
  backgroundDim, setBackgroundDim,
  backgroundFit, setBackgroundFit,
  backgroundScale, setBackgroundScale,
  themePreset, setThemePreset,
  brightness, setBrightness,
  onSave
}: AppearanceTabProps) {

  // Gestion image de fond locale
  async function handlePickBackgroundFile(f: File) {
    try {
      // Compression
      const blob = await compressImageToBlob(f, { maxWidth: 2400, quality: 0.82 });
      
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // Mode connecté : Upload vers Supabase Storage
        const fileName = `background_${Date.now()}.${blob.type.split('/')[1] || 'jpg'}`;
        const publicUrl = await uploadUserAsset(blob, fileName);
        setBackgroundImage(publicUrl);
        showSuccess("Image uploadée et définie !");
      } else {
        // Mode déconnecté : Base64 (fallback)
        const dataUrl = await blobToDataUrl(blob);
        // Vérification taille critique pour localStorage
        if (dataUrl.length > 3 * 1024 * 1024) {
          showError("Image trop volumineuse pour le mode hors connexion. Connectez-vous pour uploader des fichiers plus lourds.");
          return;
        }
        setBackgroundImage(dataUrl);
        showSuccess("Image définie (stockage local)");
      }
    } catch (err: any) {
      console.error(err);
      showError(err.message || "Erreur lors du traitement de l'image");
    }
  }

  return (
    <Card className="rounded-3xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
      <CardHeader>
        <CardTitle>Apparence</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {/* Palette */}
        <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-center">
          <Label>Palette d'accent</Label>
          <div>
            <Select value={themePreset} onValueChange={(v) => setThemePreset(v as ThemePreset)}>
              <SelectTrigger className="bg-white/10 text-white">
                <SelectValue placeholder="Choisir une palette" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="violet">Violet (par défaut)</SelectItem>
                <SelectItem value="blue">Bleu</SelectItem>
                <SelectItem value="neutral">Neutre</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Mode d'arrière-plan */}
        <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-center">
          <Label>Mode d'arrière‑plan</Label>
          <div>
            <RadioGroup value={backgroundMode} onValueChange={(v) => setBackgroundMode(v as BackgroundMode)}>
              <div className="flex items-center gap-3">
                <RadioGroupItem id="mode-image" value="image" />
                <Label htmlFor="mode-image">Image</Label>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <RadioGroupItem id="mode-color" value="color" />
                <Label htmlFor="mode-color">Couleur</Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        {/* Image: URL */}
        {backgroundMode === "image" ? (
          <>
            <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-start">
              <Label>Image de fond (URL)</Label>
              <div className="space-y-2">
                <Input
                  value={backgroundImage}
                  onChange={(e) => setBackgroundImage(e.target.value)}
                  placeholder="https://… (Unsplash, CDN interne, etc.)"
                  className="bg-white/10 text-white placeholder:text-white/60"
                />
                <p className="text-xs text-white/70">
                  Vous pouvez saisir une URL ou choisir un fichier ci‑dessous. Les fichiers locaux sont compressés automatiquement pour respecter le quota du navigateur.
                </p>
              </div>
            </div>

            {/* Image: fichier */}
            <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-start">
              <Label>Choisir un fichier</Label>
              <div className="space-y-2">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    await handlePickBackgroundFile(f);
                  }}
                  className="bg-white/10 text-white file:mr-2 file:rounded file:border-0 file:bg-white/20 file:px-3 file:py-2 file:text-white"
                />
                {backgroundImage ? (
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-20 overflow-hidden rounded-xl border border-white/20 bg-white/10">
                      {/* eslint-disable-next-line jsx-a11y/alt-text */}
                      <img src={backgroundImage} className="h-full w-full object-cover" />
                    </div>
                    <Button
                      variant="ghost"
                      className="text-white/90 hover:bg-white/10"
                      onClick={() => setBackgroundImage("")}
                    >
                      Retirer l'image
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Taille de l'image */}
            <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-center">
              <Label>Taille de l'image</Label>
              <div>
                <Select
                  value={backgroundFit}
                  onValueChange={(v) => setBackgroundFit(v as BackgroundFit)}
                >
                  <SelectTrigger className="bg-white/10 text-white">
                    <SelectValue placeholder="Choisir une taille" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">Couvrir l'écran (par défaut)</SelectItem>
                    <SelectItem value="contain">Contenir — image entière visible</SelectItem>
                    <SelectItem value="custom">Personnalisée</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {backgroundFit === "custom" ? (
              <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-center">
                <Label>Échelle de l'image: {Math.round(backgroundScale)}%</Label>
                <div>
                  <div className="px-2">
                    <Slider
                      value={[backgroundScale]}
                      min={20}
                      max={400}
                      step={5}
                      onValueChange={(v) => setBackgroundScale(v[0] ?? 100)}
                    />
                  </div>
                  <p className="mt-1 text-xs text-white/60">
                    Sous 100 %, l'image ne remplit plus l'écran : la couleur
                    d'arrière‑plan apparaît autour.
                  </p>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          // Couleur
          <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-center">
            <Label>Couleur d'arrière‑plan</Label>
            <div className="flex flex-wrap items-center gap-4">
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                aria-label="Choisir une couleur"
                className="h-10 w-14 cursor-pointer rounded-lg border border-white/20 bg-transparent p-0"
              />
              <Input
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                placeholder="#0b1220"
                className="max-w-[160px] bg-white/10 text-white placeholder:text-white/60"
              />
              <div
                className="h-10 w-16 rounded-lg border border-white/20"
                style={{ backgroundColor: backgroundColor }}
                aria-hidden
              />
            </div>
          </div>
        )}

        {/* Contraste */}
        <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-center">
          <Label>Contraste du fond (voile sombre): {Math.round(backgroundDim)}%</Label>
          <div>
            <div className="px-2">
              <Slider
                value={[backgroundDim]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) => setBackgroundDim(v[0] ?? 0)}
              />
            </div>
            <p className="mt-1 text-xs text-white/70">
              Augmenter la valeur assombrit le fond pour améliorer la lisibilité des contenus.
            </p>
          </div>
        </div>

        {/* Luminosité */}
        <div className="grid gap-2 md:grid-cols-[220px,1fr] md:items-center">
          <Label>Luminosité du fond: {Math.round(brightness)}%</Label>
          <div>
            <div className="px-2">
              <Slider
                value={[brightness]}
                min={50}
                max={150}
                step={1}
                onValueChange={(v) => setBrightness(v[0] ?? 100)}
              />
            </div>
            <p className="mt-1 text-xs text-white/70">
              Ajuste la luminosité du fond (50% = plus sombre, 150% = plus lumineux). Valeur par défaut: 100%.
            </p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button onClick={onSave} className="backdrop-blur-sm">Enregistrer</Button>
      </CardFooter>
    </Card>
  );
}