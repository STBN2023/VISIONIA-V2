# Cahier des charges — ISOEDRE Vision IA (Synthèse)

> **Document historique.** L'application s'appelle désormais **PIA VISION** et
> n'est plus rattachée au GROUPE ISOEDRE. Ce cahier des charges décrit la v1
> telle qu'imaginée au départ ; plusieurs points listés ici hors périmètre
> existent aujourd'hui. Conservé tel quel pour l'historique — voir README.md
> pour l'état réel.

## 1) Objet
- Finalité: à partir de photos d’un bâtiment, produire un compte rendu technique structuré en 3 parties (Constat technique, Solutions correctives, Conformité réglementaire) afin d’aider à la rénovation énergétique.
- Spécificité: l’analyse est pilotée par un prompt maître (modèle éditable), avec deux modes d’orchestration:
  - Agrégé: un rapport global pour N images.
  - Par image: un rapport par image (les images peuvent être intégrées dans les exports).

## 2) Contexte & valeur
- Besoin: accélérer la pré‑analyse de terrain et standardiser la restitution technique (langage pro, références normatives probables, pas d’extrapolation).
- Valeur: homogénéité des rapports, gain de temps, meilleure traçabilité des runs et des coûts LLM (à terme).

## 3) Profils utilisateurs
- Maîtrise d’œuvre / Opérateur: crée des projets, importe des images, édite le prompt et lance l’analyse, exporte le résultat.
- Lecteur: consulte les rapports, télécharge les exports.
- Admin (évolutif): gère modèles, quotas, secrets (hors v1 démo).

## 4) Fonctionnalités clés (v1)
- Gestion des projets
  - Création, liste, détail (titre, adresse, statut, type, notes).
  - Tags de projet (libres) pour organiser les images.
- Images
  - Import multi‑images par glisser‑déposer ou sélection de fichiers.
  - Formats: JPG/PNG/WebP, taille max 25 Mo/image (compression automatique côté client).
  - Taggage par image (ex: façade N, toiture, menuiseries…).
  - Prévisualisation (zoom), suppression, réordonnancement.
- Prompting
  - Bibliothèque locale de templates (défaut, duplication, édition).
  - Sélection d’un template au niveau projet + application au prompt.
  - Règle de qualité: lignes ≤ 100 caractères (alerte dans l’UI).
- Lancement d’une analyse
  - Modes: agrégé ou par image.
  - Paramètres: modèle, température, max tokens (issus des Paramètres).
  - File simple côté client: statut du run (queued/running/succeeded/failed/cancelled).
  - Journal d’erreur: détails accessibles depuis le badge “failed”.
- Restitution
  - Vue “Runs” avec résultats en temps réel.
  - Export PDF:
    - Agrégé: texte complet du rapport.
    - Par image: texte + miniature de la photo pour chaque item (conversion WebP→JPEG si nécessaire).
- Paramètres
  - Choix du provider (OpenAI par défaut), clé API locale (demo), modèle, température, max tokens.
  - Apparence (fond image/couleur, voile sombre, palette).

## 5) Parcours utilisateur type
1. Créer un projet (titre, adresse, type).
2. Importer des photos (drag & drop ou sélection) → compression/contrôle automatiques.
3. Gérer les tags (projet + par image).
4. Choisir un template de prompt, l’appliquer puis ajuster le contenu.
5. Lancer une analyse (agrégé ou par image).
6. Consulter le run; en cas d’échec, ouvrir le log depuis “failed”.
7. Exporter le PDF (par image: rapport + photo intégrée).
8. Revenir au projet pour itérations (nouvelles images, nouveau run).

## 6) Contraintes & non‑fonctionnel
- Performance UI: responsive, fluide sur navigateur desktop et mobile.
- Accessibilité: contraste renforcé (ex. choix de mode dans la modale), tailles et interactions accessibles.
- Robustesse client:
  - Compression image côté client (max 2000px, WebP/JPEG qualité ~0.82).
  - Limite d’images envoyées à l’LLM: 12 (sécurité de tokens).
- Internationalisation: FR par défaut (libellés et messages).
- Sécurité (démo):
  - Clé API stockée localement (navigateur).
  - Aucune donnée projet côté serveur par défaut (fallback localStorage).
- Confidentialité: avertir que l’IA n’est pas un diagnostic réglementaire.

## 7) Architecture (v1 démo)
- Front: React + TypeScript + Vite + Tailwind + shadcn/ui (Router: React Router).
- Mobile: Capacitor (Android/iOS) pour packager la web app dans une WebView.
- Intégration LLM:
  - Client: appel direct OpenAI (clé en Paramètres).
  - Serveur (optionnel): endpoint /api/analyze utilisant OPENAI_API_KEY (si configuré).
- Stockage:
  - Par défaut: localStorage (projets, images, runs, templates, settings).
  - Optionnel: endpoints Vercel + Postgres fournis pour basculer vers persistance serveur (à configurer).

## 8) Données principales
- Projet: id, titre, adresse, type, statut, notes, tags[], images[], templateId?, prompt.
- Image: id, name, size, type, dataUrl, createdAt, tag?, templateId?.
- Template: id, name, body, version, isDefault, timestamps.
- Run: id, projectId, mode, status, prompt, model, temperature, items[] (per_image), outputText (aggregate), error?, timestamps.

## 9) API externes
- OpenAI Chat Completions (gpt‑4o‑mini par défaut) avec multimodal (texte + image_url).
- Paramètres exposés dans l’UI (modèle, température, tokens).
- Note: quotas/erreurs provider → surfacent dans l’UI (badge “failed” + log).

## 10) Sécurité & RGPD (démo)
- Clé OpenAI conservée dans le navigateur uniquement (pas de transmission serveur v1).
- Images stockées localement (base64) pour la démo; l’utilisateur est responsable de leurs contenus.
- Message d’avertissement: cette application n’est pas un outil de diagnostic réglementaire.

## 11) Périmètre hors v1 (exemples)
- Authentification / RBAC, tenants, quotas et coûts consolidés.
- Stockage objet S3 et CDN pour grandes volumétries.
- Post‑traitements avancés (fusion sémantique, mappage normes automatique).
- Exports DOCX/Markdown, signature, archivage légal.

## 12) Critères d’acceptation (v1)
- Importer un lot d’images (dont WebP/PNG/JPG) avec compression automatique et limite 25 Mo/image.
- Lancer une analyse (agrégé et par image) et voir l’état du run.
- Consulter les erreurs via le log accessible depuis “failed”.
- Exporter un PDF:
  - Agrégé: texte complet.
  - Par image: pour chaque item, texte + photo intégrée correctement.
- Utiliser et éditer des templates de prompt avec contrôle des lignes ≤ 100 caractères.

## 13) Roadmap indicative
- v1:
  - UI projets/images/prompt/runs + export PDF + log d’erreurs + réglages API.
- v1.1:
  - Persistance serveur (Vercel Postgres), partage d’accès, audit minimal.
- v2:
  - Normalisation avancée, consolidation multi‑images, coûts/quotas, exports DOCX/MD, authentification.

## 14) Résumé
ISOEDRE Vision IA vise à transformer des photos de bâtiments en rapports techniques structurés, standardisés et exploitables, avec un flux simple (projet → images → prompt → analyse → export), des options de mode d’analyse (agrégé/par image) et un focus sur la qualité de rendu (contraste, logs d’erreur, PDF avec images).