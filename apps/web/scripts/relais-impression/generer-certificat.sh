#!/bin/bash
# Génère une fois le certificat auto-signé du relais (certificat.pem +
# cle-privee.pem, dans ce même dossier). À relancer uniquement si vous
# voulez changer d'IP ou si le certificat expire (10 ans de validité ici,
# largement suffisant). macOS a `openssl` installé par défaut, pas besoin
# d'installer quoi que ce soit.
set -e
cd "$(dirname "$0")"

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout cle-privee.pem \
  -out certificat.pem \
  -days 3650 \
  -subj "/CN=relais-impression-3sauces"

echo ""
echo "Certificat généré : certificat.pem / cle-privee.pem"
echo "Relancez le relais (node relais.mjs) pour qu'il parte en HTTPS."
