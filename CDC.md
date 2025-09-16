# Cahier des charges - Application d'analyse photo pour rénovation énergétique

## 1. Objet et périmètre
- Finalité : générer, à partir de plusieurs photos d’un bâtiment, un rapport structuré en 3
  paragraphes (constat, solutions, conformité), selon un prompt éditable.
- Périmètre v1 : upload multi-images, gestion projets/dossiers, éditeur de prompt, exécution via
  API LLM externe, consolidation et export (PDF/Docx), journal d’audit, gestion des coûts API.
- Hors périmètre v1 : OCR de documents, plans 2D/3D, mesures photogrammétriques, BIM.

## 2. Profils utilisateurs
- **Maîtrise d’œuvre** : crée projets, charge photos, lance analyses, exporte rapports.
- **Admin** : gère secrets API, quotas, modèles, rôles, référentiels normes.
- **Lecture seule** : consulte rapports, télécharge exports.

## 3. Exigences fonctionnelles
### 3.1 Gestion des projets
- CRUD projet : titre, adresse, type bâti, lot(s), client, notes.
- Dossier images par projet. Statuts : Brouillon, En cours, Terminé, Archivé.
- Versionning des rapports par exécution.

### 3.2 Upload et gestion d’images
- Upload multiple par glisser-déposer. Formats : JPG/PNG/WebP, max 25 Mo/image.
- Métadonnées : exifs, date prise de vue, auteur, localisation (si fournie).
- Taggage manuel : façade N/S/E/O, toiture, menuiseries, réseaux, pathologies.
- Prévisualisation, suppression, réordonnancement.

### 3.3 Prompting
- Prompt maître éditable au niveau :
  - **Global** (par défaut de l’organisation).
  - **Projet** (override).
  - **Exécution** (run spécifique).
- Variables de contexte : {adresse}, {climat_zone}, {annee_construction?}, {lot}.
- Bibliothèque de templates versionnés. Historique et rollback.
- Validation : longueur lignes ≤ 100 caractères (option de post-formatage durci).

### 3.4 Orchestration d’analyse
- Un run = N images + un prompt résolu.
- Options de run :
  - Par-image (1 rapport par image).
  - Agrégé (synthèse multi-images, déduplication des constats).
- Paramètres : modèle LLM, température, max tokens, langue, style “dense et technique”.
- File d’attente avec états : queued, running, succeeded, failed, cancelled.
- Relance sélective d’images en échec sans relancer tout le lot.

### 3.5 Restitution
- Structure imposée : 3 paragraphes, terminologie technique, pas d’extrapolation.
- Post-traitement :
  - Hard wrap à 100 colonnes.
  - Normalisation des sections (titres fixes).
  - Détection d’items (anomalie → solution → référence normative).
- Consolidation multi-images :
  - Fusion par similarité sémantique (cosine > seuil).
  - Priorisation par impact énergétique et criticité.
- Exports : PDF, DOCX, Markdown.
- Marquage manuel “validé par MOE” + signature électronique (option v2).

### 3.6 Référentiels et conformité
- Table de normes : RE2020, DTU principaux, Code de la construction.
- Moteur de correspondance : associe constats à normes probables.
- Aides financières : MaPrimeRénov’, CEE, éco-PTZ (mappées par travaux).
- Avertissement légal : l’IA ne remplace pas un diagnostic réglementaire.

### 3.7 Coûts, quotas, et suivi
- Dashboard coûts par projet, par run, par image, par modèle.
- Alertes seuils (mail + UI) sur budget mensuel.
- Logs d’appels API (durée, tokens, prix estimé, code HTTP).

### 3.8 Sécurité et RGPD
- Authentification OIDC. RBAC : Admin, Opérateur, Lecteur.
- Chiffrement au repos (AES-256) et en transit (TLS 1.2+).
- Secret management : KMS/HashiCorp Vault. Pas de secrets en base.
- Rétention : purge images/résultats configurable. Droit à l’effacement.
- Traçabilité : journal d’audit immuable (création, upload, runs, exports).

## 4. Exigences non fonctionnelles
- Disponibilité cible : 99.5% v1.
- Performances : TTFB UI < 200 ms, upload 100 Mo en < 30 s sur réseau standard.
- Scalabilité : workers d’analyse autoscalés (HPA).
- Observabilité : métriques, logs structurés, traces distribuées.
- Accessibilité : WCAG 2.1 AA sur les vues critiques.
- i18n : FR par défaut, EN option.

## 5. Architecture cible
- **Front** : React + TypeScript, UI lib (MUI/Chakra), uploader résilient (tus/uppy).
- **Backend** : Python FastAPI.
- **Workers** : Celery/RQ pour exécutions LLM.
- **Queue** : Redis/RabbitMQ.
- **Stockage** : objets S3-compatible pour images et exports.
- **Base** : Postgres (données, versions, journaux).
- **Cache** : Redis.
- **Secrets** : Vault/KMS.
- **CDN** : pour images prévisualisées.
- **Intégration LLM** : couche d’abstraction provider-agnostique.

## 6. Intégration API LLM externe
### 6.1 Abstraction
- Interface `LLMClient` :
  - `analyze_image(prompt, image_url|bytes, params) -> {text, usage, model}`
  - `analyze_batch(prompt, images[], params) -> stream|job_id`
  - `models()`, `quota()`, `health()`
- Implémentations : OpenAI, Anthropic, Google, Azure OpenAI. Sélecteur runtime.

### 6.2 Résilience
- Retry avec backoff exponentiel sur 429/5xx. Jitter. Circuit breaker.
- Découpage des lots pour contourner limites de payload.
- Timeouts durcis et annulation côté worker.
- Journalisation des prompts, paramètres et réponses (hashées si sensible).

### 6.3 Gouvernance et coûts
- Comptage tokens et coût estimé par run.
- Politiques par rôle : modèles autorisés, max tokens, température max.
- Quotas mensuels par organisation et par projet.

### 6.4 Sécurité des données
- Option “no data retention” si provider supporte.
- Redaction de PII dans prompts (ex : noms clients).
- Région d’hébergement du provider configurable.

## 7. Modèle de données (schéma logique)
- `organization(id, name, settings)`
- `user(id, org_id, email, role)`
- `project(id, org_id, title, address, status, meta)`
- `image(id, project_id, path, checksum, tags[], exif, uploader_id)`
- `prompt_template(id, org_id, scope{global|project}, name, body, version, is_default)`
- `run(id, project_id, template_id, mode{per_image|aggregate}, model, params, status)`
- `run_item(id, run_id, image_id, status, output_text, usage, cost)`
- `report(id, project_id, run_id, type{per_image|aggregate}, path, version)`
- `norm_reference(id, code, label, url, domain)`
- `finding(id, run_id, image_id, category, severity, text, norm_match[])`
- `audit_log(id, actor_id, action, target, ts, metadata)`
- `budget(id, org_id, month, cap, spent)`

## 8. API backend (extraits)
```http
POST   /auth/login
GET    /me

POST   /projects
GET    /projects?query=&status=
GET    /projects/{id}
PATCH  /projects/{id}
DELETE /projects/{id}

POST   /projects/{id}/images   # multipart
GET    /projects/{id}/images
DELETE /images/{id}

GET    /prompts/templates
POST   /prompts/templates
PATCH  /prompts/templates/{id}
POST   /prompts/validate       # vérifie lignes ≤ 100 chars, sections présentes

POST   /runs                   # body: {project_id, template_id|inline_prompt, mode, model, params}
GET    /runs/{id}
POST   /runs/{id}/cancel
GET    /runs/{id}/items
POST   /runs/{id}/retry-failed

GET    /reports/{id}/download?format=pdf|docx|md

GET    /llm/models
POST   /llm/test               # dry-run avec image d’exemple
GET    /billing/usage?month=
```

## 9. Moteur de post-traitement
- Normalisation : titres “Constat technique / Solutions correctives / Conformité réglementaire”.
- **Hard wrap** à 100 colonnes. Interdiction d’emoji et de termes génériques.
- Détection d’anomalies → création d’objets `finding` avec sévérité.
- Matching normes : règles heuristiques + lexiques (DTU, RE2020, CCH).
- Générateur export : gabarits Jinja2 → PDF/Docx/MD.

## 10. UX clés
- Page Projet : résumé, coût cumulé, liste runs, statut, dernier export.
- Éditeur de prompt avec versions, diff, test instantané sur 1 image.
- Page Run : progression en temps réel, erreurs, relance ciblée.
- Rapports lisibles, sections repliables, liens vers images sources.

## 11. Qualité, tests, et validation
- Tests unitaires (≥80% core), d’intégration API, et E2E Cypress/Playwright.
- Tests charge : 1 000 images/h avec 10 workers.
- Jeux d’images de référence et “golden outputs” figés.
- Critères d’acceptation v1 :
  - Upload 50 images et génération d’un rapport agrégé < 10 min avec files.
  - Respect systématique du wrap 100 colonnes.
  - Export PDF non corrompu et fidèle.
  - Traçabilité complète dans `audit_log`.

## 12. Déploiement et DevOps
- CI/CD : lint, tests, build, scan SCA, déploiement blue-green.
- Conteneurs : Docker, orchestrateur Kubernetes.
- Stockage objets versionné, lifecycle policy, antivirus à l’upload.
- Backups Postgres journaliers, restauration testée mensuellement.

## 13. Roadmap indicative
- Semaine 1–2 : design technique, schéma, maquettes UX.
- Semaine 3–5 : backend + stockage + upload + prompts.
- Semaine 6–7 : intégration LLM + workers + runs.
- Semaine 8 : post-traitement + exports.
- Semaine 9 : coûts/quotas + observabilité.
- Semaine 10 : QA, perfs, A11y, RGPD, go-live.

## 14. Risques et parades
- Variabilité LLM → post-traitement strict + prompts figés + tests dorés.
- Coûts LLM → quotas, modèles alternatifs, batching.
- Confidentialité → provider avec “no training”, chiffrement intégral.
- Débit upload → reprise et segmentation, CDN.

## 15. Livrables
- Spécifications détaillées API et schéma.
- Maquettes haute fidélité.
- Infra as Code (Terraform).
- Code source avec tests et pipeline CI.
- Dossier RGPD et PIA simplifié.
- Manuel utilisateur et runbook d’exploitation.

## 16. Extensions v2
- OCR de plans et légendes.
- Détection visuelle assistée (vision model + règles internes).
- Génération de bordereaux quantitatifs.
- Connecteurs GED (SharePoint, Drive).
- Signature qualifiée eIDAS.
