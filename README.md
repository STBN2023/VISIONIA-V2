# PIA VISION

À partir de photos de bâtiment, produire un compte rendu technique structuré
pour la rénovation énergétique. Un classifieur local trie les photos, un LLM
rédige le rapport.

Application web React + TypeScript + Vite, adossée à Supabase, déployée sur
Vercel, empaquetable en mobile via Capacitor.

---

## Démarrage rapide

Le projet utilise **pnpm**. Il n'y a plus de `package-lock.json` : `npm install`
échoue sur un conflit de peer dependencies (react-leaflet 5 réclame React 19,
le projet est en React 18).

```bash
pnpm install
```

```bash
pnpm dev
```

L'application démarre sur http://localhost:5173.
Autres scripts : `pnpm build`, `pnpm preview`, `pnpm lint`.

Aucune variable d'environnement n'est requise en local : l'URL et la clé
publique Supabase sont en dur dans `src/integrations/supabase/client.ts`.
C'est volontaire — cette clé est conçue pour être publique, la protection
repose sur les policies RLS de la base.

---

## Architecture

- **Navigateur** : SPA React.
- **Supabase** : authentification, Postgres, Storage, Edge Functions.
- **ONNX Runtime Web** : classification des images en local (WebGPU, repli WebGL puis WASM).
- **Vercel** : hébergement du build statique et de `/api/health`.

Tout l'état applicatif vit dans Supabase. Il n'y a plus de repli localStorage
pour les projets, ni de base Vercel Postgres : les deux ont existé, elles ont
été retirées.

### Tables

| Table | Rôle |
|---|---|
| `profiles` | profil utilisateur, et `settings` (JSON) synchronisé entre appareils |
| `projects` | projets (titre, adresse, statut, prompt, tags, coordonnées) |
| `inspections` | images d'un projet + `detection_results.onnx` (label, score, probs) |
| `runs` / `run_items` | analyses LLM et leurs résultats par image |
| `prompt_templates` | bibliothèque de prompts |
| `system_pings` | table témoin, utilisée uniquement par `/api/health` |

### Buckets Storage

| Bucket | Contenu |
|---|---|
| `inspections` | photos des projets |
| `assets` | ressources utilisateur (fonds, avatars) |
| `models` | le modèle ONNX, servi en public — voir « Classification » |

### Fonctions serveur

| Fonction | Où | Rôle |
|---|---|---|
| `openai-proxy` | Supabase Edge | appelle OpenAI côté serveur ; la clé n'est jamais exposée au navigateur |
| `geocode` | Supabase Edge | géocodage des adresses de projet |
| `/api/health` | Vercel | contrôle de vie ; répond `{"ok":true,"db":"ok"}` |

`api/health.ts` est le seul reliquat du dossier `api/`. Les anciens endpoints
`/api/projects` et `/api/analyze` ont été supprimés : Supabase les remplace.

---

## Routes

`/` · `/login` · `/projects` · `/projects/:id` · `/prompts` · `/settings`

La page projet regroupe les onglets Infos, Localisation, Images, Analyse, Runs.

---

## Classification des images

Un modèle ONNX (YOLOv5-cls) classe chaque photo parmi 7 catégories :
`algae`, `major_crack`, `minor_crack`, `peeling`, `plain`, `spalling`, `stain`.

### Où vit le modèle — le point important

Le modèle peut être référencé de deux façons, via *Paramètres > Dataset* :

- **`source: "idb"`** — le fichier est dans IndexedDB, donc **cloisonné par
  navigateur et par origine**. Un modèle importé sur `localhost` n'existe pas
  sur le domaine déployé. Les réglages, eux, sont synchronisés via
  `profiles.settings` : l'application se croit alors configurée alors que les
  poids sont introuvables.
- **`source: "url"`** — le fichier est téléchargé depuis une URL. C'est le mode
  à privilégier : le réglage suit le compte et fonctionne partout.

Le modèle est hébergé dans le bucket public `models`. Pour le rebrancher,
coller cette URL dans *Paramètres > Dataset > Ou URL distante*, puis
**Appliquer** :

```
https://kmgbbcwsupzcoevaolva.supabase.co/storage/v1/object/public/models/model_v2.onnx
```

Attention : dans ce même écran, les boutons **Effacer** et la corbeille
effacent aussi `modelMeta`, donc l'ordre des classes, qu'il faut alors
ressaisir.

### Mono-étiquette, et ce que cela implique

La sortie du modèle passe par un softmax : les 7 classes se partagent 100 %.
Le modèle **ne peut pas** signaler deux défauts sur une même photo, et le
dataset d'entraînement (un dossier par classe) ne contient aucune vérité
terrain multi-défauts.

Conséquence pratique : une photo cumulant deux désordres répartit sa masse de
probabilité (par exemple 45 % / 40 %) et n'a pas de top-1 franc. Le filtre
d'entrée de l'analyse LLM juge donc sur **P(défaut) = 1 − P(plain)** plutôt
que sur le score de la classe majoritaire, sans quoi il écarterait précisément
les photos les plus chargées. Voir `defectScoreFrom()` dans
`src/utils/classifier.ts`.

Les badges secondaires affichés sur les vignettes sont des **suggestions**, pas
des détections : un softmax ne distingue pas « deux défauts présents » de
« hésitation entre deux étiquettes pour un seul défaut ».

---

## Analyse LLM

1. Onglet Images : import (glisser-déposer, compression client, 25 Mo/image max).
2. Onglet Prompt : choix d'un template, édition du prompt.
3. Lancement d'un run, en mode agrégé (un rapport global) ou par image.
4. Option « Analyser uniquement les images suspectes » : pré-filtrage ONNX sur
   P(défaut) ≥ seuil calibré, pour n'envoyer au LLM que ce qui le mérite.
5. Onglet Runs : suivi, puis export PDF (`src/utils/pdf.ts`) ou DOCX
   (`src/utils/docx.ts`).

L'appel au LLM passe par l'Edge Function `openai-proxy`, qui détient la clé.

---

## Structure

```
src/
  pages/                  routes (App.tsx)
  components/
    projects/tabs/        Infos, Localisation, Images, Prompt
    runs/                 lancement, suivi, annotation des analyses
    settings/             compte, apparence, API, dataset & calibration
    uploader/             dropzone et vignettes
  utils/
    storage.ts            projets & images (Supabase)
    settings.ts           reglages, synchronisation localStorage <-> cloud
    classifier.ts         score de defaut, top-K, disponibilite du modele
    inference.ts          session ONNX, preprocessing, calibration
    analyze-client.ts     appel de openai-proxy
    pdf.ts / docx.ts      exports
supabase/functions/       openai-proxy, geocode
api/health.ts             controle de vie (Vercel)
data/                     modele et dataset - non versionne (.gitignore)
```

---

## Déploiement

Push sur `main`, Vercel déploie automatiquement.

Le dépôt est public. Sur le plan Hobby, un dépôt **privé** bloque les
déploiements dont l'auteur du commit n'est pas rattaché au compte Vercel
(« Deployment Blocked »). Si le dépôt repasse en privé, il faudra d'abord
ajouter l'adresse e-mail de l'auteur des commits aux e-mails vérifiés du
compte Vercel.

Variables d'environnement côté Vercel : `SUPABASE_URL` et
`SUPABASE_SERVICE_ROLE_KEY`, utilisées uniquement par `/api/health`. La clé
OpenAI est un secret d'Edge Function Supabase, pas une variable Vercel.

---

## Mobile

Projets Capacitor initialisés (`android/`, `ios/`). Le build web (`dist`) est
servi dans une WebView. Xcode ou Android Studio requis pour tester sur device.

Identifiant d'application : `fr.pragmaia.piavision`, sur Android comme sur iOS.
Il remplaçait `com.example.tinyaxolotldart`, valeur laissée par le gabarit de
départ : le préfixe `com.example` est refusé par les stores. Le changer après
publication reviendrait à créer une application distincte — c'est donc fait
avant.

---

## Dépannage

**Aucun pourcentage sur les vignettes.** Le modèle n'est pas joignable. Un
message d'erreur explicite s'affiche désormais au lieu d'un faux
« Classification terminée ». Vérifier le mode du modèle : en `idb`, il est
absent de tout navigateur autre que celui où il a été importé.

**Un réglage disparaît tout seul.** Bug corrigé : une écriture ratée vers
Supabase était silencieuse, et la copie cloud périmée réécrasait le réglage
local au chargement suivant. `saveSettings()` horodate maintenant chaque
écriture, `loadSettingsFromCloud()` refuse d'écraser une version plus récente,
et un échec d'enregistrement s'affiche à l'écran.

**Les photos multi-défauts n'étaient pas analysées.** Corrigé, voir
« Mono-étiquette » plus haut.

**react-leaflet.** La version 5 installée réclame React 19 alors que le projet
est en React 18. pnpm installe malgré l'avertissement ; à surveiller si la
carte de l'onglet Localisation se comporte mal.

---

## Documents

- `cdc.md` — cahier des charges d'origine, rédigé quand le projet s'appelait
  encore ISOEDRE Vision IA. Il décrit la v1 (stockage local, clé API dans le
  navigateur, pas d'authentification) et **ne reflète plus l'implémentation** : l'authentification, la persistance serveur et les
  exports DOCX, listés hors périmètre v1, existent aujourd'hui.
- `Workflow du projet.md` — fonctionnement bout-à-bout.
