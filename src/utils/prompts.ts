import { supabase } from "@/integrations/supabase/client";

export type PromptTemplate = {
  id: string;
  name: string;
  body: string;
  isDefault?: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

// ---- localStorage legacy helpers (for migration) ----

const LOCAL_STORAGE_KEY = "prompt_templates";

function readLocalAll(): PromptTemplate[] {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PromptTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---- In-memory cache ----

let _templatesCache: PromptTemplate[] | null = null;
let _cacheTs = 0;
const CACHE_TTL = 2000;

function getCached(): PromptTemplate[] {
  if (_templatesCache && Date.now() - _cacheTs < CACHE_TTL) {
    return _templatesCache;
  }
  // Trigger async refresh
  refreshCache();
  // Return cached or localStorage fallback
  return _templatesCache || readLocalAll();
}

async function refreshCache() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      _templatesCache = readLocalAll();
      _cacheTs = Date.now();
      return;
    }

    const { data, error } = await supabase
      .from("prompt_templates")
      .select("*")
      .eq("user_id", user.id)
      .order("name");

    if (error) {
      console.error("Error fetching templates:", error);
      _templatesCache = readLocalAll();
      _cacheTs = Date.now();
      return;
    }

    const dbTemplates = (data || []).map(mapDbTemplate);

    // Merge with localStorage templates not yet in DB
    const localTemplates = readLocalAll();
    const dbIds = new Set(dbTemplates.map((t) => t.id));
    const localOnly = localTemplates.filter((t) => !dbIds.has(t.id));

    _templatesCache = [...dbTemplates, ...localOnly].sort(
      (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name)
    );
    _cacheTs = Date.now();
  } catch (e) {
    console.error("Error refreshing templates cache:", e);
  }
}

function mapDbTemplate(row: any): PromptTemplate {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    isDefault: row.is_default || false,
    version: row.version || 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function invalidateCache() {
  _templatesCache = null;
  _cacheTs = 0;
}

// ---- Seed templates ----

export async function ensureSeedTemplates() {
  // Check if already seeded in Supabase
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Not logged in — use localStorage seed
    ensureLocalSeed();
    return;
  }

  // Check if user already has templates
  const { data: existing } = await supabase
    .from("prompt_templates")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  if (existing && existing.length > 0) {
    // Already has templates — migrate any localStorage ones
    await migrateLocalToCloud(user.id);
    // Refresh cache from Supabase so getTemplates() returns fresh data
    await refreshCache();
    return;
  }

  // Check localStorage for existing templates to migrate
  const localTemplates = readLocalAll();
  if (localTemplates.length > 0) {
    await migrateLocalToCloud(user.id);
    await refreshCache();
    return;
  }

  // Seed fresh templates
  const now = new Date().toISOString();
  const seeds = [
    {
      user_id: user.id,
      name: "Expert Pathologies & CCTP (JSON)",
      body: SEED_BODY_EXPERT,
      is_default: true,
      version: 1,
      created_at: now,
      updated_at: now,
    },
    {
      user_id: user.id,
      name: "Standard FR",
      body: SEED_BODY_STANDARD,
      is_default: false,
      version: 1,
      created_at: now,
      updated_at: now,
    },
    {
      user_id: user.id,
      name: "Style technique dense",
      body: SEED_BODY_DENSE,
      is_default: false,
      version: 1,
      created_at: now,
      updated_at: now,
    },
  ];

  await supabase.from("prompt_templates").insert(seeds);
  await refreshCache();
}

async function migrateLocalToCloud(userId: string) {
  const localTemplates = readLocalAll();
  if (localTemplates.length === 0) return;

  for (const tpl of localTemplates) {
    // Check if already exists in cloud
    const { data: existing } = await supabase
      .from("prompt_templates")
      .select("id")
      .eq("user_id", userId)
      .eq("name", tpl.name)
      .limit(1);

    if (existing && existing.length > 0) continue;

    await supabase.from("prompt_templates").insert({
      user_id: userId,
      name: tpl.name,
      body: tpl.body,
      is_default: tpl.isDefault || false,
      version: tpl.version || 1,
      created_at: tpl.createdAt,
      updated_at: tpl.updatedAt,
    });
  }

  invalidateCache();
}

function ensureLocalSeed() {
  const existing = readLocalAll();
  if (existing.length > 0) return;

  const now = new Date().toISOString();
  const seed: PromptTemplate[] = [
    {
      id: crypto.randomUUID(),
      name: "Expert Pathologies & CCTP (JSON)",
      body: SEED_BODY_EXPERT,
      isDefault: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: "Standard FR",
      body: SEED_BODY_STANDARD,
      isDefault: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: "Style technique dense",
      body: SEED_BODY_DENSE,
      isDefault: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  ];
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(seed));
}

// ---- Public API (synchronous with cache) ----

export function getTemplates(): PromptTemplate[] {
  return getCached();
}

export function getTemplateById(id: string): PromptTemplate | undefined {
  return getCached().find((t) => t.id === id);
}

export function getDefaultTemplate(): PromptTemplate | undefined {
  return getCached().find((t) => t.isDefault);
}

export function createTemplate(input: { name: string; body: string; isDefault?: boolean }): PromptTemplate {
  const now = new Date().toISOString();
  const tpl: PromptTemplate = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    body: input.body,
    isDefault: !!input.isDefault,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  // Update cache immediately
  if (_templatesCache) {
    if (tpl.isDefault) {
      _templatesCache = _templatesCache.map((t) => ({ ...t, isDefault: false }));
    }
    _templatesCache.push(tpl);
  }

  // Also save to localStorage as fallback
  const local = readLocalAll();
  if (tpl.isDefault) local.forEach((t) => (t.isDefault = false));
  local.push(tpl);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(local));

  // Async save to Supabase
  (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (tpl.isDefault) {
      await supabase
        .from("prompt_templates")
        .update({ is_default: false, updated_at: now })
        .eq("user_id", user.id);
    }

    await supabase.from("prompt_templates").insert({
      id: tpl.id,
      user_id: user.id,
      name: tpl.name,
      body: tpl.body,
      is_default: tpl.isDefault,
      version: tpl.version,
      created_at: tpl.createdAt,
      updated_at: tpl.updatedAt,
    });
    invalidateCache();
  })();

  return tpl;
}

export function updateTemplate(id: string, patch: Partial<Omit<PromptTemplate, "id" | "createdAt">>): PromptTemplate | undefined {
  const all = getCached();
  const prev = all.find((t) => t.id === id);
  if (!prev) return undefined;

  const next: PromptTemplate = {
    ...prev,
    ...patch,
    version: (patch.body !== undefined || patch.name !== undefined) ? prev.version + 1 : prev.version,
    updatedAt: new Date().toISOString(),
  };

  // Update cache
  if (_templatesCache) {
    if (patch.isDefault) {
      _templatesCache = _templatesCache.map((t) => ({ ...t, isDefault: false }));
    }
    const idx = _templatesCache.findIndex((t) => t.id === id);
    if (idx >= 0) _templatesCache[idx] = next;
  }

  // Update localStorage
  const local = readLocalAll();
  const localIdx = local.findIndex((t) => t.id === id);
  if (patch.isDefault) local.forEach((t) => (t.isDefault = false));
  if (localIdx >= 0) local[localIdx] = next;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(local));

  // Async save to Supabase
  (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (patch.isDefault) {
      await supabase
        .from("prompt_templates")
        .update({ is_default: false, updated_at: next.updatedAt })
        .eq("user_id", user.id);
    }

    await supabase
      .from("prompt_templates")
      .update({
        name: next.name,
        body: next.body,
        is_default: next.isDefault,
        version: next.version,
        updated_at: next.updatedAt,
      })
      .eq("id", id);
    invalidateCache();
  })();

  return next;
}

export function deleteTemplate(id: string) {
  // Update cache
  if (_templatesCache) {
    _templatesCache = _templatesCache.filter((t) => t.id !== id);
  }

  // Update localStorage
  const local = readLocalAll().filter((t) => t.id !== id);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(local));

  // Async delete from Supabase
  (async () => {
    await supabase.from("prompt_templates").delete().eq("id", id);
    invalidateCache();
  })();
}

export function setDefaultTemplate(id: string) {
  const all = getCached();
  let changed = false;

  // Update cache
  if (_templatesCache) {
    _templatesCache = _templatesCache.map((t) => {
      if (t.id === id && !t.isDefault) {
        changed = true;
        return { ...t, isDefault: true, updatedAt: new Date().toISOString() };
      }
      if (t.id !== id && t.isDefault) {
        changed = true;
        return { ...t, isDefault: false, updatedAt: new Date().toISOString() };
      }
      return t;
    });
  }

  if (!changed) return;

  // Update localStorage
  const local = readLocalAll();
  local.forEach((t) => {
    t.isDefault = t.id === id;
    t.updatedAt = new Date().toISOString();
  });
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(local));

  // Async update Supabase
  const now = new Date().toISOString();
  (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("prompt_templates")
      .update({ is_default: false, updated_at: now })
      .eq("user_id", user.id);

    await supabase
      .from("prompt_templates")
      .update({ is_default: true, updated_at: now })
      .eq("id", id);

    invalidateCache();
  })();
}

export function getPromptLineErrors(body: string): number[] {
  return [];
}

// ---- Seed template bodies ----

const SEED_BODY_EXPERT = `Tu es un ingénieur bureau d'études spécialisé en pathologies du bâtiment, maîtrise d'œuvre et rédaction de CCTP.

Tu analyses des images de chantier et identifies toutes les anomalies visibles, tous corps d'état confondus.

Règles impératives :
1. Identifier uniquement ce qui est visible.
2. Ne jamais inventer un élément non observable.
3. Si incertitude : utiliser la mention "Sous réserve de vérification sur site".
4. Ne jamais inventer de norme.
5. Mentionner uniquement des références normatives existantes et pertinentes.
6. Rédiger comme un bureau d'études expérimenté.
7. Utiliser un style impératif normatif.
8. Regrouper automatiquement les anomalies par LOT technique.
9. Une anomalie distincte = une entrée distincte.
10. Aucun texte hors JSON.

Pour chaque anomalie :
- description : description factuelle de l'anomalie visible.
- analyse_technique : explication technique et cause probable.
- risques_associes : risques structurels, réglementaires, assurantiels ou de durabilité.
- prescription_cctp : rédaction impérative type CCTP.
- references_normatives : uniquement si pertinentes.

Structure obligatoire de sortie (JSON) :
{
  "lots": [
    {
      "lot": "",
      "anomalies": [
        {
          "description": "",
          "analyse_technique": "",
          "risques_associes": "",
          "prescription_cctp": "",
          "references_normatives": []
        }
      ]
    }
  ]
}

Contraintes rédactionnelles :
- Regrouper par lot (Gros œuvre, Enveloppe, Étanchéité, Menuiseries extérieures, CVC, Électricité, Plomberie, Sécurité incendie, Accessibilité, etc.).
- Ne pas créer de lot vide.
- Si aucune anomalie n'est détectée, retourner : {"lots": []}`;

const SEED_BODY_STANDARD = `Constat technique:
- Décrire objectivement les pathologies visibles, sans extrapolation.

Solutions correctives:
- Proposer des actions concrètes, hiérarchisées par impact énergétique.

Conformité réglementaire:
- Citer les références applicables (RE2020, DTU pertinents), sans inventer.`;

const SEED_BODY_DENSE = `Constat technique (dense, terminologie pro):
- ...

Solutions correctives (priorisées):
- ...

Conformité réglementaire (références probables):
- ...`;