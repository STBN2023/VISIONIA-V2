import React, { useState, useEffect } from "react";

/**
 * Glass UI – kit minimal reproductible
 * Objectif: extraire le pattern "interface transparente" (glassmorphism)
 * sans DOM imperatif, réutilisable, accessible, SSR‑safe.
 *
 * Pré-requis: TailwindCSS + plugin filters (backdrop-blur inclus par défaut >= v3).
 *
 * tailwind.config.js → safelist utile si couleurs dynamiques sont composées:
 *   safelist: [
 *     { pattern: /(bg|text|border)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(100|200|300|400|500|600)/ },
 *   ],
 *
 * globals.css → radial helper (optionnel):
 *   .bg-gradient-radial { background: radial-gradient(circle, var(--tw-gradient-from), var(--tw-gradient-to)); }
 */

/** Design tokens rapides */
export const glass = {
  panel: "bg-white/8 backdrop-blur-2xl border border-white/20 shadow-2xl",
  hover: "hover:border-white/30",
  rounded: "rounded-3xl",
};

/** Utilitaire: classe conditionnelle */
function cx(...s: (string | false | undefined)[]) {
  return s.filter(Boolean).join(" ");
}

/** Dock vertical type visionOS (statique) */
export function GlassDock({ children }: { children: React.ReactNode }) {
  return (
    <aside className="fixed left-6 top-1/2 -translate-y-1/2 z-40">
      <div className={cx(glass.panel, glass.rounded, glass.hover, "pt-6 pb-6 px-3 flex flex-col gap-3 items-center transition-all")}> 
        {children}
      </div>
    </aside>
  );
}

export function DockButton({ active=false, children }: { active?: boolean; children: React.ReactNode }){
  return (
    <button aria-pressed={active} className={cx(
      "relative p-4 rounded-2xl transition-transform duration-300 overflow-hidden",
      active ? "bg-white/15 border border-white/30" : "hover:bg-white/20",
    )}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"/>
      <div className="relative">{children}</div>
    </button>
  );
}

/** Overlay + panneau latéral contrôlés par état, sans getElementById */
export function GlassSidebar({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Escape pour fermer
  useEffect(() => {
    function onKey(e: KeyboardEvent){ if(e.key === "Escape" && open) onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* overlay mobile */}
      <div
        aria-hidden
        className={cx(
          "fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity lg:hidden",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* panneau */}
      <aside
        className={cx(
          "fixed lg:absolute left-4 top-4 bottom-4 w-80 z-40 transition-transform",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        aria-label="Barre latérale"
      >
        <div className={cx(glass.panel, glass.rounded, glass.hover, "h-full overflow-hidden")}> 
          {children}
        </div>
      </aside>
    </>
  );
}

/** Carte verre réutilisable */
export function GlassCard({
  children,
  className,
}: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx(glass.panel, glass.rounded, glass.hover, "transition-all", className)}>
      {children}
    </div>
  );
}

/** Entête flottant */
export function GlassHeader({ left, center, right }:{ left?: React.ReactNode; center?: React.ReactNode; right?: React.ReactNode }){
  return (
    <header className="m-4 mb-0">
      <div className={cx(glass.panel, glass.rounded, glass.hover, "p-6 flex items-center justify-between")}> 
        <div className="flex items-center gap-3">{left}</div>
        <div className="flex-1 max-w-xl mx-6">{center}</div>
        <div className="flex items-center gap-2">{right}</div>
      </div>
    </header>
  );
}

/** Page démo minimale pour reproduire le look "transparent" */
export default function GlassDemo(){
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen text-white relative overflow-hidden">
      {/* Arrière-plan immersif */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950"/>
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=2400&auto=format&fit=crop')] bg-cover opacity-20"/>
        <div className="absolute -top-20 -right-20 w-[32rem] h-[32rem] bg-gradient-radial from-blue-400/20 to-transparent rounded-full blur-3xl"/>
        <div className="absolute -bottom-20 -left-20 w-[28rem] h-[28rem] bg-gradient-radial from-fuchsia-400/20 to-transparent rounded-full blur-3xl"/>
      </div>

      {/* Dock */}
      <GlassDock>
        <DockButton>
          <span className="sr-only">Accueil</span>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
        </DockButton>
        <DockButton active>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
        </DockButton>
        <DockButton>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        </DockButton>
      </GlassDock>

      {/* Sidebar */}
      <GlassSidebar open={open} onClose={()=>setOpen(false)}>
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">RL</div>
            <div>
              <div className="font-semibold">RIOT GAMES</div>
              <div className="text-xs text-white/60">Champions</div>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <GlassCard className="p-4">
            <div className="text-sm text-white/70">Search</div>
            <div className="mt-2 relative">
              <input className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm placeholder-white/50 focus:outline-none" placeholder="Search champions…"/>
            </div>
          </GlassCard>
          <GlassCard className="p-4">
            <div className="text-sm text-white/70 mb-2">Filters</div>
            <div className="flex gap-2 flex-wrap">
              {["All","Top","Jungle","Mid","ADC","Support"].map((t)=> (
                <span key={t} className="text-xs bg-white/10 border border-white/20 rounded-lg px-2 py-1">{t}</span>
              ))}
            </div>
          </GlassCard>
        </div>
      </GlassSidebar>

      {/* Header */}
      <GlassHeader
        left={
          <button className="lg:hidden p-3 rounded-2xl border border-white/10 hover:border-white/30" onClick={()=>setOpen(true)} aria-label="Ouvrir le menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
        }
        center={<input className="w-full bg-transparent border border-white/10 rounded-2xl px-4 py-2 text-sm placeholder-white/60" placeholder="Search champions…"/>}
        right={<>
          <button className="p-3 rounded-2xl border border-white/10 hover:border-white/30" aria-label="Calendar">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          </button>
          <button className="p-3 rounded-2xl border border-white/10 hover:border-white/30" aria-label="List">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6h.01M3 12h.01M3 18h.01M8 6h13M8 12h13M8 18h13"/></svg>
          </button>
        </>}
      />

      {/* Contenu */}
      <main className="m-4 mt-4 lg:ml-96">
        <GlassCard className="p-8 min-h-[60vh]">
          <h2 className="text-xl font-semibold">Grid</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            {Array.from({length:6}).map((_,i)=> (
              <GlassCard key={i} className="overflow-hidden">
                <div className="aspect-video bg-white/10"/>
                <div className="p-4">
                  <div className="font-medium">Card {i+1}</div>
                  <div className="text-sm text-white/70">Texte secondaire</div>
                </div>
              </GlassCard>
            ))}
          </div>
        </GlassCard>
      </main>
    </div>
  );
}
