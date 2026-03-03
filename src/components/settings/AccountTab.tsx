import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { showSuccess, showError } from "@/utils/toast";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile } from "@/utils/upload";
import { Camera, Save, KeyRound, User } from "lucide-react";

type Profile = {
  first_name: string;
  last_name: string;
  site: string;
  job_title: string;
  specialty: string;
  avatar_url: string;
  updated_at: string;
};

const emptyProfile: Profile = {
  first_name: "",
  last_name: "",
  site: "",
  job_title: "",
  specialty: "",
  avatar_url: "",
  updated_at: "",
};

export function AccountTab() {
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Password
  const [newPassword, setNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "first_name, last_name, site, job_title, specialty, avatar_url, updated_at"
        )
        .eq("id", user.id)
        .single();

      if (!error && data) {
        setProfile({
          first_name: data.first_name ?? "",
          last_name: data.last_name ?? "",
          site: data.site ?? "",
          job_title: data.job_title ?? "",
          specialty: data.specialty ?? "",
          avatar_url: data.avatar_url ?? "",
          updated_at: data.updated_at ?? "",
        });
      }
      setLoading(false);
    })();
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      showError("Non connecté");
      setSaving(false);
      return;
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: profile.first_name.trim(),
        last_name: profile.last_name.trim(),
        site: profile.site.trim(),
        job_title: profile.job_title.trim(),
        specialty: profile.specialty.trim(),
        updated_at: now,
      })
      .eq("id", user.id);

    setSaving(false);
    if (error) {
      showError(error.message);
    } else {
      setProfile((p) => ({ ...p, updated_at: now }));
      showSuccess("Profil enregistré");
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showError("Sélectionnez une image.");
      return;
    }

    setUploadingAvatar(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non connecté");

      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar.${ext}`;
      const url = await uploadFile(file, "assets", path);

      await supabase
        .from("profiles")
        .update({ avatar_url: url, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      setProfile((p) => ({ ...p, avatar_url: url + "?t=" + Date.now() }));
      showSuccess("Avatar mis à jour");
    } catch (err: any) {
      showError(err?.message || "Erreur lors de l'upload");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      showError("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    setUpdatingPassword(true);
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setUpdatingPassword(false);

    if (error) {
      showError(error.message);
    } else {
      showSuccess("Mot de passe mis à jour !");
      setNewPassword("");
    }
  };

  const patch = (field: keyof Profile, value: string) =>
    setProfile((p) => ({ ...p, [field]: value }));

  const displayName = [profile.first_name, profile.last_name.toUpperCase()]
    .filter(Boolean)
    .join(" ");

  const initials = [profile.first_name?.[0], profile.last_name?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase();

  if (loading) {
    return (
      <Card className="rounded-3xl border-white/20 bg-white/10 text-white backdrop-blur-2xl p-12 text-center">
        <p className="text-white/60 animate-pulse">Chargement du profil…</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile Card */}
      <Card className="rounded-3xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
        <CardContent className="pt-6 space-y-6">
          {/* Header: Avatar + Name + Role */}
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="relative group shrink-0">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Avatar"
                  className="h-20 w-20 rounded-full object-cover border-2 border-white/20"
                />
              ) : (
                <div className="h-20 w-20 rounded-full bg-white/15 border-2 border-white/20 flex items-center justify-center">
                  {initials ? (
                    <span className="text-2xl font-bold text-white/70">
                      {initials}
                    </span>
                  ) : (
                    <User className="h-8 w-8 text-white/40" />
                  )}
                </div>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <Camera className="h-5 w-5 text-white" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>

            {/* Name + email + role */}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold truncate">
                {displayName || "Nouveau compte"}
              </h2>
              <p className="text-sm text-white/60 truncate mt-0.5">{email}</p>
            </div>

            {/* Change avatar button (desktop) */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
              className="hidden sm:flex border-white/20 bg-white/5 text-white hover:bg-white/10 backdrop-blur-sm"
            >
              <Camera className="mr-2 h-4 w-4" />
              {uploadingAvatar ? "Upload…" : "Changer l'avatar"}
            </Button>
          </div>

          <Separator className="border-white/10" />

          {/* Form fields */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Prénom</Label>
              <Input
                value={profile.first_name}
                onChange={(e) => patch("first_name", e.target.value)}
                placeholder="Prénom"
                className="bg-white/5 border-white/15 text-white placeholder:text-white/40"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Nom</Label>
              <Input
                value={profile.last_name}
                onChange={(e) => patch("last_name", e.target.value)}
                placeholder="NOM"
                className="bg-white/5 border-white/15 text-white placeholder:text-white/40"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Adresse mail</Label>
            <Input
              value={email}
              disabled
              className="bg-white/5 border-white/15 text-white/50 cursor-not-allowed"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Site</Label>
              <Input
                value={profile.site}
                onChange={(e) => patch("site", e.target.value)}
                placeholder="ex: Lyon, Paris…"
                className="bg-white/5 border-white/15 text-white placeholder:text-white/40"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Poste occupé</Label>
              <Input
                value={profile.job_title}
                onChange={(e) => patch("job_title", e.target.value)}
                placeholder="ex: Chargé d'affaire"
                className="bg-white/5 border-white/15 text-white placeholder:text-white/40"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Spécialité</Label>
            <Input
              value={profile.specialty}
              onChange={(e) => patch("specialty", e.target.value)}
              placeholder="ex: Structure, Fluide…"
              className="bg-white/5 border-white/15 text-white placeholder:text-white/40"
            />
          </div>

          {/* Save + updated_at */}
          <div className="flex items-center gap-4 pt-2">
            <Button
              onClick={handleSaveProfile}
              disabled={saving}
              className="backdrop-blur-sm"
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
            {profile.updated_at && (
              <span className="text-xs text-white/40">
                Dernière mise à jour :{" "}
                {new Date(profile.updated_at).toLocaleString("fr-FR")}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Password Card */}
      <Card className="rounded-3xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="h-5 w-5 text-white/70" />
            <h3 className="text-base font-semibold">Sécurité du compte</h3>
          </div>
          <div className="flex gap-2 max-w-md">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nouveau mot de passe (min. 6 car.)"
              className="bg-white/5 border-white/15 text-white placeholder:text-white/40"
            />
            <Button
              onClick={handleUpdatePassword}
              disabled={updatingPassword}
              variant="outline"
              className="border-white/20 bg-white/5 text-white hover:bg-white/10 backdrop-blur-sm whitespace-nowrap"
            >
              {updatingPassword ? "Mise à jour…" : "Modifier"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
