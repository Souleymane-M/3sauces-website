#!/usr/bin/env node
// Script de bootstrap pour créer un compte interne (employé, livreur ou
// patron) directement en base, via la clé service_role.
//
// Usage (depuis apps/web/) :
//   node --env-file=.env.local scripts/creer-profil.mjs --role patron --nom "Nom" --secret "motdepasse-solide"
//   node --env-file=.env.local scripts/creer-profil.mjs --role employe --nom "Nom" --secret "1234"
//   node --env-file=.env.local scripts/creer-profil.mjs --role livreur --nom "Nom" --secret "5678"
//
// Lance-le toi-même dans ton terminal avec le PIN/mot de passe réel que tu
// veux utiliser : ce script ne fait que hasher (bcrypt) et insérer en base,
// le secret en clair n'est jamais stocké ni affiché en retour.

import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      const cle = argv[i].slice(2);
      const valeur = argv[i + 1];
      args[cle] = valeur;
      i += 1;
    }
  }
  return args;
}

async function main() {
  const { role, nom, secret } = parseArgs(process.argv.slice(2));

  if (!role || !nom || !secret) {
    console.error(
      "Usage: node --env-file=.env.local scripts/creer-profil.mjs --role <employe|livreur|patron> --nom \"Nom\" --secret \"...\""
    );
    process.exit(1);
  }

  if (!["employe", "livreur", "patron"].includes(role)) {
    console.error('role doit être "employe", "livreur" ou "patron".');
    process.exit(1);
  }

  if (role !== "patron" && !/^\d{4,6}$/.test(secret)) {
    console.error("Le PIN employé/livreur doit être numérique, 4 à 6 chiffres.");
    process.exit(1);
  }

  if (role === "patron" && secret.length < 8) {
    console.error("Le mot de passe patron doit faire au moins 8 caractères.");
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error(
      "SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis (lance avec --env-file=.env.local)."
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const hash = await bcrypt.hash(secret, 10);

  const payload =
    role === "patron"
      ? { nom, role, mot_de_passe_hash: hash }
      : { nom, role, pin_hash: hash };

  const { data, error } = await supabase
    .from("profils")
    .insert(payload)
    .select("id, nom, role")
    .single();

  if (error) {
    console.error("Échec de la création du profil :", error.message);
    process.exit(1);
  }

  console.log(`Profil créé : ${data.nom} (${data.role}), id=${data.id}`);
}

main();
