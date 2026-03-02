import React, { useState, useEffect } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GlassShell } from "@/components/layout/GlassShell";
import BrandLogo from "@/components/branding/BrandLogo";

export default function Login() {
  const [session, setSession] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) navigate('/');
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) navigate('/');
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (!session) {
    return (
      <GlassShell className="flex items-center justify-center p-4">
        <Card className="w-full max-w-md rounded-3xl border-white/20 bg-white/10 text-white shadow-2xl backdrop-blur-2xl overflow-hidden">
          <CardHeader className="space-y-2 text-center pb-2">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-white/10 rounded-2xl border border-white/20 backdrop-blur-xl">
                <BrandLogo height={48} />
              </div>
            </div>
            <CardTitle className="text-3xl font-black tracking-tight text-white uppercase italic">VISIOEDRE</CardTitle>
            <CardDescription className="text-white/60 font-medium">
              Audit Technique & Énergétique Intelligent
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 px-8 pb-8">
            <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-center">
              <p className="text-[11px] text-blue-300 font-bold uppercase tracking-wider">
                Accès restreint aux adresses @groupe-isoedre.fr
              </p>
            </div>
            <Auth
              supabaseClient={supabase}
              appearance={{
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: '#1e293b',
                      brandAccent: '#334155',
                      brandButtonText: 'white',
                      inputBackground: 'rgba(255, 255, 255, 0.05)',
                      inputText: 'white',
                      inputPlaceholder: 'rgba(255, 255, 255, 0.4)',
                      inputBorder: 'rgba(255, 255, 255, 0.1)',
                      inputBorderFocus: 'rgba(255, 255, 255, 0.3)',
                      inputBorderHover: 'rgba(255, 255, 255, 0.2)',
                    },
                    radii: {
                      borderRadiusButton: '14px',
                      inputBorderRadius: '14px',
                    },
                  },
                },
                style: {
                  button: { 
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)', 
                    fontWeight: 'bold', 
                    height: '44px',
                    color: 'white',
                    backdropFilter: 'blur(10px)'
                  },
                  label: { color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', marginLeft: '4px' },
                  anchor: { color: 'rgba(255,255,255,0.5)', textDecoration: 'none' },
                }
              }}
              providers={[]}
              localization={{
                variables: {
                  sign_in: {
                    email_label: 'Adresse e-mail',
                    password_label: 'Mot de passe',
                    button_label: 'Se connecter',
                    loading_button_label: 'Connexion en cours...',
                    link_text: 'Déjà un compte ? Connectez-vous',
                    email_input_placeholder: 'votre@email.com',
                    password_input_placeholder: 'votre mot de passe',
                  },
                  sign_up: {
                    email_label: 'Adresse e-mail',
                    password_label: 'Mot de passe',
                    button_label: "S'inscrire",
                    loading_button_label: 'Inscription en cours...',
                    link_text: "Pas de compte ? S'inscrire",
                    email_input_placeholder: 'votre@email.com',
                    password_input_placeholder: 'votre mot de passe',
                  },
                  forgotten_password: {
                    email_label: 'Adresse e-mail',
                    password_label: 'Mot de passe',
                    button_label: 'Réinitialiser le mot de passe',
                    link_text: 'Mot de passe oublié ?',
                    email_input_placeholder: 'votre@email.com',
                  },
                  update_password: {
                    password_label: 'Nouveau mot de passe',
                    button_label: 'Mettre à jour le mot de passe',
                    password_input_placeholder: 'votre nouveau mot de passe',
                  }
                }
              }}
              theme="dark"
            />
          </CardContent>
        </Card>
      </GlassShell>
    );
  }

  return null;
}