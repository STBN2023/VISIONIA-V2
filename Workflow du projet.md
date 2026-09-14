# Workflow du projet

Fonctionnement bout-à-bout de l'application : ce qui se passe, dans quel ordre,
et où vivent les données à chaque étape.

Voir aussi : [README.md](README.md) pour l'architecture et le démarrage,
`cdc.md` pour le cahier des charges d'origine (qui ne reflète plus
l'implémentation).

---

## 1. Vue d'ensemble

1. L'utilisateur s'authentifie (Supabase Auth).
2. Il crée un projet, puis y ajoute des photos.
3. Un classifieur ONNX local trie et tague les photos.
4. Il choisit un prompt et lance une analyse.
5. Une Edge Function appelle le LLM ; le résultat est stocké et affiché.
6. Il exporte le compte rendu en PDF ou DOCX.

Tout est persisté dans Supabase. Aucun repli localStorage pour les données
métier — seuls les réglages ont une copie locale, et elle est synchronisée.

---

## 2. Authentification

`src/pages/Login.tsx`, session gérée par Supabase Auth.

Les policies RLS filtrent par `user_id` : chaque utilisateur ne voit que ses
projets. C'est là que repose la sécurité, pas sur le secret de la clé publique
embarquée dans le bundle.

Détail d'implémentation : le code privilégie `getSession()` (lecture du cache)
plutôt que `getUser()` (appel réseau) sur les chemins fréquents.

---

## 3. Projets

`src/utils/storage.ts` — lecture et écriture via le client Supabase.

- `getProjectsList()` : liste allégée, ne charge pas les images (juste leur
  nombre). C'est ce qui rend la page Projets rapide.
- `getProjectById()` : projet complet avec ses `inspections`.
- `createProject()`, `updateProject()`, `deleteProject()`.

Correspondance base ↔ application, assurée par `mapDbToProject()` :

| Base (`projects`) | Application |
|---|---|
| `name` | `title` |
| `location` | `address` |
| `description` | `type` |

Les images sont dans la table `inspections`, une ligne par photo, reliée par
`project_id`.

---

## 4. Images

`src/components/projects/tabs/ImagesTab.tsx`, `src/utils/image-compress.ts`.

À l'import :

1. Formats acceptés : JPG, PNG, WebP. 25 Mo maximum par image.
2. Compression côté client : redimensionnement à 2000 px maximum, encodage
   WebP (ou JPEG) en qualité ~0,82. La version la plus légère est conservée.
3. Une image encore au-dessus de 25 Mo après compression est ignorée.
4. Le fichier part dans le bucket `inspections` ; la ligne en base ne stocke
   que son URL.

`updateProject()` ne réenvoie que les images nouvelles : celles dont l'URL
n'est plus une `data:` URL voient uniquement leurs métadonnées mises à jour.

---

## 5. Classification ONNX

`src/utils/inference.ts` (session et inférence), `src/utils/classifier.ts`
(logique métier).

### Chargement du modèle

`getOrCreateSession()` met la session en cache par clé
`source:value:backends`. Changer de modèle ou de backend invalide le cache.

Les poids proviennent soit d'IndexedDB (`source: "idb"`), soit d'une URL
(`source: "url"`). **Ce choix est structurant** : IndexedDB est cloisonné par
navigateur et par origine, alors que le réglage qui le référence, lui, est
synchronisé via `profiles.settings`. Un modèle importé sur `localhost` est donc
absent du domaine déployé pendant que l'application se croit configurée.

`getModelUnavailableReason()` existe pour ça : elle vérifie la présence réelle
des poids avant de lancer un lot, et renvoie un message actionnable.

### Inférence

1. Préprocessing : redimensionnement à `inputSize` (224 par défaut),
   normalisation ImageNet, tenseur `[1, 3, H, W]`.
2. Backends essayés dans l'ordre : WebGPU, WebGL, WASM.
3. Sortie : logits → **softmax** → vecteur `probs` de 7 valeurs sommant à 1.

### Du vecteur au tag

L'ordre des classes vient de `modelMeta.classesOrder` :

| index | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| classe | algae | major_crack | minor_crack | peeling | plain | spalling | stain |

`classMapping` traduit ensuite l'étiquette du modèle en tag métier
(`major_crack` → « fissure majeure »).

`defectScoreFrom(probs)` calcule **1 − P(plain)** : la probabilité qu'il se
passe quelque chose, indépendamment de la classe. C'est ce score, et non le
top-1, qui décide si une photo est suspecte — voir la section 7.

---

## 6. Prompts

`src/utils/prompts.ts`, `src/pages/Prompts.tsx`, table `prompt_templates`.

Création, duplication, édition, suppression, marquage « par défaut ».
Le cahier des charges prévoit une règle « chaque ligne tient en 100
caractères », signalée dans l'interface. Elle est **inactive** :
`getPromptLineErrors()` retourne toujours un tableau vide
(`src/utils/prompts.ts`). À réactiver ou à retirer, mais ne pas la supposer en
vigueur.

Au niveau d'un projet (`PromptTab`), on sélectionne un template puis on
l'applique au champ prompt. Le texte réellement envoyé est celui présent dans
le champ au moment du lancement.

### Deux sources, une seule liste

`refreshCache()` affiche la fusion de la table `prompt_templates` et d'une
copie localStorage héritée (`prompt_templates`), **réconciliées par
identifiant**. La copie locale n'est là que pour la migration des utilisateurs
d'avant Supabase.

Piège corrigé : `migrateLocalToCloud()` insérait les templates sans reprendre
leur identifiant, Postgres en générait un neuf, et la fusion ne reconnaissait
plus les deux copies comme un même objet — chaque template migré s'affichait en
double, définitivement, la copie locale n'étant jamais effacée. Renommer la
copie « base » d'un doublon en créait même une troisième, la migration
comparant par nom.

Désormais l'insertion conserve l'identifiant local, la copie navigateur est
supprimée une fois la migration réussie (et seulement dans ce cas), et la
fusion déduplique aussi par nom pour absorber les migrations déjà faites.

---

## 7. Analyse LLM

`src/components/runs/RunAnalysisDialog.tsx`, `src/utils/analyze-client.ts`.

### Pré-filtrage optionnel

Case « Analyser uniquement les images suspectes ». Chaque photo passe par le
classifieur, et le vecteur `probs` complet est écrit dans
`inspections.detection_results.onnx`.

Le critère de rétention est `isSuspectFrom(probs)`, c'est-à-dire
`P(défaut) ≥ seuil`.

Pourquoi pas le top-1 : le softmax fait se concurrencer les classes. Une photo
cumulant deux désordres répartit sa masse (par exemple 45 % / 40 %) et passe
sous le seuil sur chaque classe prise isolément, alors qu'elle n'a que 15 % de
chances d'être saine. Filtrer sur le top-1 écartait donc en priorité les photos
les plus intéressantes du lot.

### Exécution

1. `createPendingRun()` crée le run en statut `running` (table `runs`).
2. `analyzeLLM()` appelle l'Edge Function `openai-proxy`, qui détient la clé
   OpenAI. Les images partent en `dataUrl`, limitées à 12 par appel.
3. Deux modes : **agrégé** (un rapport global) ou **par image** (un résultat
   par photo, dans `run_items`).
4. Succès → `completeRunWithServer()`. Échec → `failRun()`, avec le détail
   accessible depuis le badge « failed ».

### Suivi

`RunsTab` affiche la progression avec étapes et chronomètre, et interroge la
base périodiquement. Les résultats sont dédupliqués par identifiant : une
course entre le cache et le polling produisait auparavant des doublons.

---

## 8. Exports

- **PDF** : `src/utils/pdf.ts`. En mode par image, la photo est intégrée à
  chaque section (conversion WebP → JPEG si nécessaire).
- **DOCX** : `src/utils/docx.ts`.

---

## 9. Réglages

`src/utils/settings.ts`, clé localStorage `isoedre_settings_v1`, miroir dans
`profiles.settings`.

Contenu : apparence, préférences LLM, `modelRef`, `modelMeta`, `classMapping`,
seuil d'inférence, rapport de calibration.

### Arbitrage local ↔ cloud

C'est le point délicat, et il a déjà causé une perte de données.

- `saveSettings()` écrit en local, **horodate** l'écriture (`updatedAt`), puis
  pousse vers Supabase en arrière-plan.
- Un échec de cette écriture est **signalé à l'utilisateur** (message d'erreur,
  limité à un toutes les 30 secondes).
- `loadSettingsFromCloud()` compare les horodatages. Si la copie locale est
  plus récente que celle du cloud, elle est **conservée** et repoussée, au lieu
  d'être écrasée.

Auparavant, une écriture ratée était silencieuse et la copie cloud périmée
réécrasait le réglage au chargement suivant. C'est ainsi que
`modelMeta.classesOrder` pouvait disparaître : les classes restaient affichées
à l'écran (repli sur le manifeste du dataset) alors que le réglage n'existait
plus, produisant un « Configuration incomplète » incompréhensible.

Note : `getStoredUpdatedAt()` lit le JSON brut plutôt que le résultat de
`getSettings()`, dont les valeurs par défaut incluent un `updatedAt` valant
« maintenant » — s'en servir pour arbitrer ferait toujours gagner le local.

---

## 10. Calibration

`src/components/settings/DatasetCalibrateCard.tsx`, `src/utils/inference.ts`.

Sur un échantillon du dataset, l'application balaie une grille de seuils et
recommande celui qui équilibre faux positifs et faux négatifs. Le résultat est
stocké dans `calibrationReport` et alimente `inference.threshold`.

Piège de cet écran : les boutons **Effacer** et la corbeille appellent
`clearModelSelection()`, qui remet à zéro `modelRef` **et** `modelMeta`. On perd
donc l'ordre des classes, pas seulement le modèle.

---

## 11. Corrections manuelles

`src/utils/corrections.ts`, clé localStorage `corrections_stats`.

Quand l'utilisateur corrige régulièrement un tag proposé vers un autre,
l'application retient la préférence et la privilégie ensuite. Purement local,
non synchronisé.

---

## 12. Cycle utilisateur résumé

1. Se connecter.
2. Créer un projet (titre, adresse, type).
3. Importer les photos ; compression et contrôles automatiques.
4. « Classer et taguer » : tags proposés par le modèle, ajustables à la main.
5. Choisir un template de prompt, l'appliquer, l'ajuster.
6. Lancer l'analyse, avec ou sans pré-filtrage des images suspectes.
7. Suivre le run, consulter le résultat, ouvrir le log en cas d'échec.
8. Exporter en PDF ou DOCX.
