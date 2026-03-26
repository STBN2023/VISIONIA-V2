# ISOEDRE Vision IA

Application web React + TypeScript + Vite + Tailwind + shadcn/ui, avec fonctions serverless (Vercel) et packaging mobile via Capacitor.

- Frontend: React 18, Vite, Tailwind, shadcn/ui, React Router.
- API serverless: Vercel (TypeScript, `api/*.ts`).
- Mobile: Capacitor (Android/iOS), web app servie en WebView.

---

## Démarrage rapide (local)

Prérequis:
- Node.js 18+ (recommandé), npm (ou pnpm/yarn).
- Navigateur récent.

Étapes:
1) Installer les dépendances: `npm install`
2) Lancer en développement: `npm run dev`
3) Ouvrir: `http://localhost:5173`

Dans l’interface Dyad:
- Rebuild: réinstalle les dépendances et relance (si besoin).
- Restart: redémarre le serveur de dev.
- Refresh: rafraîchit l’aperçu.

---

## Fonctionnalités principales

- Projets: création, liste, suppression, détails.
- Images: import drag & drop, compression automatique (client), tags.
- Prompts: templates locaux (création, duplication, édition, suppression, “défaut”).
- Analyse LLM: envoi des images + prompt à un modèle (serverless), suivi des runs (succès/erreurs).
- Fallback local: si la base n’est pas configurée, le stockage se fait en `localStorage`.
- Amélioration continue:
  - Calibration du seuil de classification (paramètres).
  - Mémoire locale des corrections de tags: l’app apprend de vos corrections pour améliorer les prochaines suggestions.

---

## Variables d’environnement

- `OPENAI_API_KEY`: obligatoire pour l’analyse LLM (`POST /api/analyze`). Sans cette clé, le run échouera (le reste de l’app reste fonctionnel).
- Vercel Postgres:
  - `POSTGRES_URL` (et variantes) injectées automatiquement par Vercel si vous liez une base Postgres.

Sans ces variables:
- Projets/Images: fallback `localStorage`.
- Analyse: `POST /api/analyze` renvoie 500 (échec).

---

## API serverless (Vercel)

- Projets:
  - `GET /api/projects` — liste des projets
  - `POST /api/projects` — création
  - `GET /api/projects/:id` — détail (avec images)
  - `PATCH /api/projects/:id` — mise à jour
  - `DELETE /api/projects/:id` — suppression
  - Implémentation: `api/projects/index.ts` et `api/projects/[id].ts` (utilise `@vercel/postgres`).
- Analyse LLM:
  - `POST /api/analyze` (Edge) — appelle OpenAI Chat Completions (par défaut `gpt-4o-mini`).
  - Champs attendus: `mode`, `prompt`, `images[] (dataUrl)`, `model?`, `temperature?`, `max_tokens?`.

---

## Structure du projet

- `src/pages/` — pages (routes configurées dans `src/App.tsx`)
- `src/components/` — composants UI (shadcn/ui inclus), layout, logique métier
- `src/utils/` — utilitaires (stockage, compression, prompts, runs, analyse, etc.)
- `api/` — endpoints serverless Vercel
- `public/` — assets statiques
- `android/`, `ios/` — Capacitor (mobile)

Page d’accueil par défaut: `src/pages/Index.tsx`.

---

## Flux utilisateur

1) Créer un projet (ouvert via le bouton dans le header).
2) Importer des images (drag & drop), compression et tags.
3) Choisir/éditer un template de prompt et appliquer au projet.
4) Lancer une analyse (“Générer le compte rendu”) et suivre le run.
5) Consulter les résultats (global ou par image), relancer si nécessaire.

---

## Classification, calibration et corrections

- Le classifieur local (ONNX) propose un tag avec un score.
- La calibration (Paramètres) ajuste le seuil pour réduire faux positifs/négatifs.
- Mémoire locale des corrections: si vous corrigez souvent un tag vers un autre, l’app privilégie votre préférence à l’avenir.
  - Stockage: `localStorage` clé `corrections_stats`.
  - Pour “réinitialiser” cette préférence, supprimer cette clé dans le stockage du navigateur.

---

## Déploiement (Vercel)

1) Lier le repo à Vercel.
2) Configurer les variables d’environnement:
   - `OPENAI_API_KEY` (obligatoire pour l’analyse)
   - Attacher Vercel Postgres si vous voulez une persistance serveur (facultatif).
3) Déployer. Les fonctions `api/*` sont automatiquement exposées.

Remarques:
- Sans Postgres: l’app fonctionne avec fallback local (console peut afficher des 500 pour `/api/projects`, c’est attendu).
- Sans `OPENAI_API_KEY`: l’analyse renverra 500.

---

## Mobile (Capacitor)

- Le bundle web est construit dans `dist` et servi en WebView.
- iOS/Android: projets déjà initialisés (`ios/`, `android/`).
- Pour tester sur device/émulateur, installez les SDK natifs (Xcode / Android Studio) et suivez la doc Capacitor.

---

## Dépannage

- Erreurs 500 sur `/api/projects`: le fallback `localStorage` prend le relais (l’app reste utilisable).
- Analyse qui échoue: vérifier `OPENAI_API_KEY`.
- Toasts qui restent visibles: les toasts de fin sont auto-dismiss après ~3,5 s; si un toast persiste, rafraîchir l’aperçu.
- Suggestions de tags incohérentes: recalibrez le seuil et/ou laissez l’app apprendre de vos corrections; vérifiez aussi la cohérence des tags (casse/orthographe).
- Problèmes d’images (taille): les images > 25 Mo sont ignorées (après tentative de compression).

---

## Scripts utiles

- `npm run dev` — démarre le serveur de développement Vite.
- `npm run build` — build de production (Vite).
- `npm run preview` — sert le build localement.

---

## Licence

Usage interne / projet démonstration. Adapter selon votre contexte.
