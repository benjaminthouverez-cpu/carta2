# Carta 2.0 — état des lieux & reprise

> Document de reprise. À lire en premier pour continuer le projet plus tard.
> Dernière mise à jour : 15 juin 2026.

## Vue d'ensemble

Deux applications **séparées et indépendantes** :

| | Carta 1.0 (stable) | Carta 2.0 (en construction) |
|---|---|---|
| But | Outil en service, ne pas casser | Version structurelle (relationnel, collaboration) |
| Dépôt | `benjaminthouverez-cpu/carta` | `benjaminthouverez-cpu/carta2` |
| Site | https://benjaminthouverez-cpu.github.io/carta/ | https://benjaminthouverez-cpu.github.io/carta2/ |
| Clone local | `C:\Users\benjamin.thouverez\carta` | `C:\Users\benjamin.thouverez\carta2` |
| Backend | Supabase projet `bbqtpsijneremxpkpxdk`, **blob JSON** par user | Supabase projet DÉDIÉ, **modèle relationnel** |
| Déploiement | GitHub Pages (push sur `main`) | idem |

⚠️ **Isolation 2.0** : clés localStorage `carta2-*` (origine github.io partagée), et base Supabase **distincte** de la 1.0. Modifier la 2.0 ne touche jamais la 1.0.

## Ce qui est FAIT sur la 2.0
- Réplique conforme de la 1.0 (kanban, carte mentale, échéances, tri manuel, undo, PWA, export JSON, ErrorBoundary, inscription self-service, reset mot de passe).
- **Backend relationnel branché et déployé** :
  - Schéma : `supabase/schema.sql` (tables `boards`, `board_members` [rôles owner/editor/viewer], `groups`, `columns`, `cards`, `links`, `profiles` ; RLS par appartenance ; triggers profil + owner-membership ; temps réel).
  - Couche d'accès : `src/db.js` (CRUD, membres/partage, temps réel, `signInWithGoogle`, et la **sync par réconciliation** : `flattenBoard` / `persistBoard` / `collectIds`).
  - `src/App.jsx` : au login → charge le tableau relationnel ; sauvegarde par réconciliation (upsert + suppression des lignes disparues) ; temps réel par rechargement (garde anti-écho). Logique d'interface inchangée.
  - `src/storage.js` : `uid()` renvoie des UUID (compatibles colonnes `uuid`).
  - Connexion Google câblée (bouton « Continuer avec Google »).

## Projet Supabase 2.0 actuel
- Ref : `wquoizfkjmimqwnkxviv` — URL `https://wquoizfkjmimqwnkxviv.supabase.co`.
- `schema.sql` exécuté ✅ (vérifié : 7 tables répondent en REST, RLS active).
- Clé anon (publique) déjà dans `src/supabaseConfig.js`.

### 👉 Si tu mets en place un NOUVEAU projet Supabase
Très simple :
1. Crée le projet, **SQL Editor → coller `supabase/schema.sql` → Run**.
2. **Project Settings → API** → copie **Project URL** + clé **anon public**.
3. Remplace les 2 valeurs dans `src/supabaseConfig.js`, commit + push (déploie).
   (Ne jamais mettre la clé `service_role` ni le mot de passe DB.)

## Ce qui RESTE à faire
1. **Test navigateur** du parcours connexion → édition → rechargement → sync (jamais testé en vrai ; corriger ce qui surgit).
2. **Google login** : finir l'OAuth Google Cloud (voir `supabase/SETUP.md` partie B). Tant que non fait, le bouton Google renvoie « provider is not enabled » → utiliser e-mail/mot de passe.
   - Pour tester vite en e-mail : Supabase → Authentication → Email → décocher « Confirm email ».
3. **Contacts / personnes** : pas encore synchronisés côté cloud (locaux seulement) → à refaire en **assignés = membres** du tableau.

## Caveats connus
- Sync = réconciliation **niveau tableau** (« dernier qui enregistre gagne » ; deux éditions simultanées de cartes différentes peuvent s'écraser, atténué par le rechargement temps réel). L'écriture fine par carte est une amélioration ultérieure.
- Avertissement GitHub Actions « Node 20 déprécié » sur les workflows des 2 dépôts (non bloquant ; bumper `actions/*` plus tard).

## Roadmap (jalons 2.0)
1. ✅ Lecture/écriture relationnelle (remplace le blob).  ← on est ici
2. **Tableaux partagés + rôles** (vrai saut collaboration) + Google login.
3. Commentaires + historique d'activité.
4. Pièces jointes (Storage) + checklists/sous-tâches + tags.
5. Notifications (rappels d'échéance, @mention) + intégrations (Slack, Google Agenda, Notion).

## Coûts
Gratuit à cette échelle (GitHub Pages + Supabase free + Google OAuth). Limite free Supabase : 2 projets actifs (1.0 + 2.0 = 2), mise en veille après ~7 j d'inactivité. Premier coût utile : Supabase Pro ~25 $/mois (sauvegardes + pas de mise en veille) le jour où l'outil devient critique.
