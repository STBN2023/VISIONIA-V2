# Workflow du projet

Ce document décrit le fonctionnement bout‑à‑bout de l’application (frontend, API serverless sur Vercel, stockage, analyse LLM), ainsi que les prérequis d’environnement.

Liens utiles:
- Cahier des charges (détaillé): `CDC.md`
- Stack: React + TypeScript + Vite + Tailwind + shadcn/ui, Capacitor (Android/iOS), Vercel (front + API)

---

## 1) Vue d’ensemble

1. L’utilisateur gère des projets (création, liste, détails).
2. Il ajoute des images au projet (drag & drop, compression client, tags).
3. Il configure un prompt (ou applique un template) et lance une analyse.
4. Le serveur appelle un LLM (OpenAI) sur les images, puis le résultat est stocké côté client (local) et affiché dans l’onglet “Runs”.
5. En l’absence de base de données côté serveur, l’app utilise un fallback local (localStorage) pour les projets et les runs, afin de rester fonctionnelle.

---

## 2) Frontend: pages et flux

- Routes principales (src/App.tsx):
  - `/` Index, présentation.
  - `/projects` Liste et création de projets.
  - `/projects/:id` Détail projet (Images / Prompt / Infos / Runs).
  - `/prompts` Gestion de templates de prompt (localStorage).
  - `/settings` Paramètres d’appel LLM (stockés localement).

- Header (src/components/layout/AppHeader.tsx): navigation + bouton “Nouveau projet”.

---

## 3) Gestion des projets

- Lecture/écriture via utilitaires (src/utils/storage.ts):
  - Tente d’abord l’API (Vercel).
  - Si l’API échoue (ex: pas de DB), bascule en localStorage (logs informatifs en console).
- Création (src/pages/Projects.tsx):
  - Ouvre un Dialog (ProjectFormDialog) et appelle `createProject`.
  - En cas d’erreur 500 côté API, l’app crée le projet en localStorage (fallback).
- Détail (src/pages/ProjectDetail.tsx):
  - Charge le projet (API ou fallback).
  - Tabs: Images, Prompt, Infos, Runs.

Remarque: Sans Vercel Postgres configuré, vous verrez un 500 en console lorsque l’API est appelée; c’est normal et le fallback local prend le relais.

---

## 4) Import et gestion d’images

- Import (src/components/projects/tabs/ImagesTab.tsx):
  - Formats acceptés: JPG/PNG/WebP, taille max 25 Mo/image.
  - Drag & drop ou sélection fichier.
- Compression automatique (src/utils/image-compress.ts):
  - Redimensionnement max 2000px, encodage WebP (ou JPEG) qualité ~0.82.
  - À l’import, on choisit la version la plus légère; si l’original > 25 Mo, on tente la version compressée.
  - Images encore > 25 Mo après compression: ignorées.
  - Bilan via toasts (ajoutées / compressées / ignorées).
- Métadonnées internes:
  - `name`, `size`, `type`, `dataUrl`, `createdAt`, `tag?`, `templateId?`.
- Sauvegarde:
  - PATCH `/api/projects/:id` (avec liste d’images) ou fallback localStorage.

---

## 5) Templates et prompt

- Templates (src/utils/prompts.ts, src/pages/Prompts.tsx):
  - Stockés en localStorage (seed au premier lancement).
  - Création, duplication, édition, suppression, “défaut”.
  - Validation: chaque ligne ≤ 100 caractères.
- Au niveau projet (src/components/projects/tabs/PromptTab.tsx):
  - Sélection d’un template “projet” (stocké côté serveur si API OK, sinon local).
  - Bouton “Appliquer au prompt” (copie le contenu du template dans le champ prompt).
  - Le prompt utilisé pour l’analyse est le texte présent au moment du lancement du run.

---

## 6) Lancement d’une analyse LLM

- Déclencheur (RunAnalysisDialog):
  1) Crée un run en “running” côté client via `createPendingRun(...)` (src/utils/runs.ts).
  2) Appelle l’API serverless: `POST /api/analyze` (src/utils/analyze-client.ts).
  3) À la réponse:
     - Succès: `completeRunWithServer(...)` met à jour le run (aggregate ou per_image).
     - Échec: `failRun(...)` marque le run en “failed”.
- Visualisation:
  - RunsTab (src/components/runs/RunsTab.tsx) affiche la progression, poll simple toutes les 1s.
  - Pour per_image: statut par image et texte retourné par le LLM.
- Annulation / Relance:
  - “Annuler” si run en `queued` ou `running` (client-side).
  - “Relancer les échecs” (simulation locale pour les items échec si vous utilisez l’ancien mode simulé).

---

## 7) API serverless sur Vercel

- Projets:
  - `GET /api/projects` → liste des projets.
  - `POST /api/projects` → création d’un projet.
  - `GET /api/projects/:id` → détail du projet + images.
  - `PATCH /api/projects/:id` → mise à jour (champs + images).
  - `DELETE /api/projects/:id` → suppression projet (+ images).
  - Implémentation: `api/projects/index.ts` et `api/projects/[id].ts`
    - Utilise `@vercel/postgres`.
    - `ensureTables()` crée les tables si nécessaire:
      - `projects(id, title, address, type, status, prompt, template_id, notes, created_at, updated_at)`
      - `images(id, project_id, name, size, type, data_url, created_at, tag, template_id)`
- Analyse LLM:
  - `POST /api/analyze` (Edge runtime): appelle OpenAI Chat Completions avec gpt‑4o‑mini par défaut.
  - Champs attendus: `mode`, `prompt`, `images[] (dataUrl)`, `model?`, `temperature?`, `max_tokens?`
  - Variables d’environnement requises: `OPENAI_API_KEY`.

---

## 8) Environnements et variables

- Vercel Postgres (pour persistance serveur des projets/images):
  - Vercel Dashboard → Storage → Add Postgres → lier au projet.
  - Les variables `POSTGRES_URL` (et variantes) sont injectées automatiquement.
- OpenAI (pour l’analyse):
  - Définir `OPENAI_API_KEY` dans les variables d’environnement Vercel.
- Sans ces variables:
  - Projets/Images: fallback localStorage (fonctionnel, mais non persistant côté serveur).
  - Analyse: `POST /api/analyze` renverra 500 si `OPENAI_API_KEY` manquant.

---

## 9) Gestion des erreurs et comportement

- Si `GET/POST/PATCH /api/projects` renvoie 500:
  - Le front trace un avertissement et bascule automatiquement en localStorage.
- Si `POST /api/analyze` renvoie une erreur (ex: clé manquante):
  - Le run est marqué “failed” et l’erreur est affichée en toast.
- Les toasts (src/utils/toast.ts, via sonner) informent des actions importantes:
  - Création / suppression projet, ajout images, fin d’analyse, erreurs.

---

## 10) Mobile (Capacitor)

- Le projet est prêt à être packagé via Capacitor (dossiers `android/` et `ios/`).
- La web app (dist) est servie dans une WebView.
- Les images étant compressées côté client, l’import reste fluide sur mobile.

---

## 11) Conseils d’exploitation

- Pour une utilisation serveur complète:
  - Activer Vercel Postgres et OpenAI (variables env).
  - Vérifier la taille mémoire des fonctions si vous prévoyez de gros lots d’images (même compressées).
- Pour une démo sans backend:
  - Accepter les 500 dans la console pour `/api/projects` (fallback local).
  - Lancer l’analyse uniquement si `OPENAI_API_KEY` est renseignée; sinon le run échouera.

---

## 12) Résumé du cycle utilisateur

1) “Nouveau projet” → saisie → création (API ou local).
2) Onglet “Images” → drag & drop → compression → ajout → taggage/ordre.
3) Onglet “Prompt” → choix template (facultatif) → édition du prompt → “Générer le compte rendu”.
4) Onglet “Runs” → suivre l’exécution → consulter résultats (global ou par image).
5) Retour aux projets → ré-édition / nouvelles images / nouveaux runs.