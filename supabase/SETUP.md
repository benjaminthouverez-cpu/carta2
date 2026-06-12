# Backend Carta 2.0 — mise en place

Carta 2.0 utilise un **projet Supabase dédié** (séparé de la 1.0) avec un vrai
modèle relationnel. Étapes, une seule fois :

## 1. Créer le projet
- https://supabase.com → **New project** (nom : `carta2`, région proche : EU).
- Note le mot de passe de la base (gardé par Supabase, pas besoin côté app).

## 2. Créer le schéma
- Dashboard → **SQL Editor** → **New query**.
- Colle tout le contenu de [`schema.sql`](./schema.sql) → **Run**.
- Vérifie dans **Table Editor** que les tables `boards`, `board_members`,
  `groups`, `columns`, `cards`, `links`, `profiles` existent.

## 3. Activer la connexion Google
- **Authentication → Sign In / Providers → Google** : active, et renseigne le
  Client ID / Secret (créés dans Google Cloud Console, OAuth consent + identifiants
  « Web »). Redirect autorisée à mettre côté Google :
  `https://<ref>.supabase.co/auth/v1/callback`.
- (Optionnel mais conseillé pour @bigmamma.com : restreindre au domaine.)

## 4. URLs de redirection de l'app
- **Authentication → URL Configuration** :
  - **Site URL** : `https://benjaminthouverez-cpu.github.io/carta2/`
  - **Redirect URLs** : ajoute la même.

## 5. Me transmettre les coordonnées publiques
Dans **Project Settings → API**, copie :
- **Project URL** (`https://<ref>.supabase.co`)
- **anon public key**

Je les mettrai dans `src/supabaseConfig.js` (elles sont publiques par nature ;
la sécurité repose sur les règles RLS du `schema.sql`).

---

Une fois ces 5 étapes faites, je branche le front sur ces tables et je construis
les fonctionnalités 2.0 par jalons :
**1.** lecture/écriture relationnelle (remplace le blob JSON) →
**2.** Google login + tableaux partagés + rôles →
**3.** commentaires + historique →
**4.** pièces jointes / checklists →
**5.** notifications + intégrations.
