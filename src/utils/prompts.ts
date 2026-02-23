export type PromptTemplate = {
  id: string;
  name: string;
  body: string;
  isDefault?: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "prompt_templates";

function readAll(): PromptTemplate[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PromptTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(templates: PromptTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function ensureSeedTemplates() {
  const existing = readAll();
  if (existing.length > 0) return;

  const now = new Date().toISOString();
  const seed: PromptTemplate[] = [
    {
      id: crypto.randomUUID(),
      name: "Standard FR",
      body: `Constat technique:
- Décrire objectivement les pathologies visibles, sans extrapolation.

Solutions correctives:
- Proposer des actions concrètes, hiérarchisées par impact énergétique.

Conformité réglementaire:
- Citer les références applicables (RE2020, DTU pertinents), sans inventer.`,
      isDefault: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: "Style technique dense",
      body: `Constat technique (dense, terminologie pro):
- ...

Solutions correctives (priorisées):
- ...

Conformité réglementaire (références probables):
- ...`,
      isDefault: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  ];
  writeAll(seed);
}

export function getTemplates(): PromptTemplate[] {
  return readAll().sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
}

export function getTemplateById(id: string): PromptTemplate | undefined {
  return readAll().find((t) => t.id === id);
}

export function getDefaultTemplate(): PromptTemplate | undefined {
  return readAll().find((t) => t.isDefault);
}

export function createTemplate(input: { name: string; body: string; isDefault?: boolean }): PromptTemplate {
  const all = readAll();
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
  if (tpl.isDefault) {
    all.forEach((t) => (t.isDefault = false));
  }
  all.push(tpl);
  writeAll(all);
  return tpl;
}

export function updateTemplate(id: string, patch: Partial<Omit<PromptTemplate, "id" | "createdAt">>): PromptTemplate | undefined {
  const all = readAll();
  const idx = all.findIndex((t) => t.id === id);
  if (idx === -1) return undefined;
  const prev = all[idx];
  const next: PromptTemplate = {
    ...prev,
    ...patch,
    version: (patch.body !== undefined || patch.name !== undefined) ? prev.version + 1 : prev.version,
    updatedAt: new Date().toISOString(),
  };
  if (patch.isDefault) {
    all.forEach((t, i) => (all[i] = { ...t, isDefault: false }));
    next.isDefault = true;
  }
  all[idx] = next;
  writeAll(all);
  return next;
}

export function deleteTemplate(id: string) {
  const all = readAll().filter((t) => t.id !== id);
  writeAll(all);
}

export function setDefaultTemplate(id: string) {
  const all = readAll();
  let changed = false;
  all.forEach((t) => {
    if (t.id === id) {
      if (!t.isDefault) changed = true;
      t.isDefault = true;
      t.updatedAt = new Date().toISOString();
    } else if (t.isDefault) {
      changed = true;
      t.isDefault = false;
      t.updatedAt = new Date().toISOString();
    }
  });
  if (changed) writeAll(all);
}

/**
 * @deprecated Line length restriction is no longer required.
 */
export function getPromptLineErrors(body: string): number[] {
  return []; // Always return empty array as the restriction is removed
}