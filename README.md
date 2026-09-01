# 3 Sauces — Système complet

Monorepo pnpm/Turborepo pour l'outil de gestion 3 Sauces : caisse, livraison,
stocks, fidélité, finances et site public — le tout branché sur une base
Supabase unique.

## Structure

```
apps/
  web/            → Application Next.js unique (site public + /caisse + /livreur + /patron)
packages/
  supabase/       → Client Supabase partagé (browser + server)
  ui/             → Composants UI partagés
  config/         → Configuration partagée (tsconfig, etc.)
supabase/
  migrations/     → Schéma SQL versionné (appliqué manuellement via SQL Editor pour l'instant)
```

## Démarrage

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # puis remplir les clés (Supabase, Twilio, Resend, Anthropic, Stripe, SumUp)
pnpm dev                     # lance apps/web sur http://localhost:3000
```

Routes par rôle :
- `/` — accueil / site public
- `/caisse` — module employé (Module 1)
- `/livreur` — module livreur (Module 2)
- `/patron` — dashboard patron (Modules 3, 4, 6)

## Stack

- Next.js 16 (App Router, Turbopack)
- Supabase (Postgres + Auth + Edge Functions)
- Twilio Verify (OTP site uniquement — vérification identité à la commande en ligne)
- Resend (email transactionnel : fidélité, rappels expiration)
- Stripe (paiement site) / SumUp (paiement caisse physique)
- Anthropic API (OCR factures fournisseurs)
