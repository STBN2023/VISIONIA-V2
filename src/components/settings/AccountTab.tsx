import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { showSuccess, showError } from "@/utils/toast";
import { supabase } from "@/integrations/supabase/client";

export function AccountTab() {
  const [newPassword, setNewPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      showError("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    setUpdatingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setUpdatingPassword(false);
    
    if (error) {
      showError(error.message);
    } else {
      showSuccess("Mot de passe mis à jour avec succès !");
      setNewPassword("");
    }
  };

  return (
    <Card className="rounded-3xl border-white/20 bg-white/10 text-white backdrop-blur-2xl">
      <CardHeader>
        <CardTitle>Sécurité du compte</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nouveau mot de passe</Label>
            <div className="flex gap-2">
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 6 caractères"
                className="bg-white/10 border-white/20 text-white"
              />
              <Button 
                onClick={handleUpdatePassword} 
                disabled={updatingPassword}
                className="backdrop-blur-sm whitespace-nowrap"
              >
                {updatingPassword ? "Mise à jour..." : "Modifier"}
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-white/40 italic">
            Note : Cette modification est immédiate et ne nécessite pas de confirmation par email (idéal pour contourner les limites du mode Free).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
