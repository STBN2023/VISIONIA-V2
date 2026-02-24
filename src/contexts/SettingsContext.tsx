import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { 
  type Settings, 
  getSettings as loadLocalSettings, 
  saveSettings as saveLocalSettings, 
  loadSettingsFromCloud 
} from "@/utils/settings";
import { supabase } from "@/integrations/supabase/client";

type SettingsContextType = {
  settings: Settings;
  loading: boolean;
  updateSettings: (patch: Partial<Settings>) => void;
  refreshSettings: () => Promise<void>;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadLocalSettings());
  const [loading, setLoading] = useState(true);

  // Initial load: Local + Cloud sync
  useEffect(() => {
    let mounted = true;
    
    async function init() {
      // 1. Start with local (already set in state init)
      
      // 2. Try to load from cloud if user is logged in
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const cloudSettings = await loadSettingsFromCloud();
          if (mounted) {
            setSettings(cloudSettings);
          }
        }
      } catch (e) {
        console.error("Failed to load settings from cloud", e);
      } finally {
        if (mounted) setLoading(false);
      }

      // 3. Listen for auth changes to reload settings
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          const cloudSettings = await loadSettingsFromCloud();
          if (mounted) setSettings(cloudSettings);
        } else if (event === 'SIGNED_OUT') {
           // Reset to default/local or keep current? 
           // Usually acceptable to keep current or reload default.
           // For now, let's just reload local to be safe.
           setSettings(loadLocalSettings());
        }
      });
      
      return () => subscription.unsubscribe();
    }

    init();
    return () => { mounted = false; };
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    // 1. Update state immediately for UI responsiveness
    setSettings(prev => {
      const next = { ...prev, ...patch };
      // 2. Persist to storage (Local + Cloud) via utility
      saveLocalSettings(patch); 
      return next;
    });
  }, []);

  const refreshSettings = useCallback(async () => {
    setLoading(true);
    try {
        const cloudSettings = await loadSettingsFromCloud();
        setSettings(cloudSettings);
    } finally {
        setLoading(false);
    }
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSettings, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
