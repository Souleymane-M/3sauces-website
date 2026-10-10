# Relais d'impression

## Pourquoi ce dossier existe

Les imprimantes Epson TM-m30III ne laissent jamais le site 3sauces.fr leur
parler directement depuis le navigateur (blocage de sécurité du navigateur
appelé CORS, confirmé le 2026-10-09 — aucun réglage de l'imprimante ne
permet de l'autoriser). Ce petit programme tourne en permanence sur un
ordinateur du restaurant (le Mac) : le site lui parle à lui (ce qu'il
autorise), et lui retransmet le ticket à l'imprimante.

## Mise en route (une seule fois)

Ouvrez le Terminal, placez-vous dans ce dossier :

```bash
cd ~/3sauces-website/apps/web/scripts/relais-impression
```

**1. Générer le certificat de sécurité du relais :**

```bash
chmod +x generer-certificat.sh
./generer-certificat.sh
```

**2. Lancer le relais :**

```bash
node relais.mjs
```

Vous devez voir `[relais] démarré sur le port 8099 (HTTPS)`. Laissez cette
fenêtre de Terminal ouverte (voir "Garder le relais toujours actif"
plus bas pour ne pas avoir à y penser).

**3. Trouver l'adresse IP du Mac sur le réseau** (celui du Wi-Fi utilisé par
l'imprimante et les tablettes) :

Réglages Système → Wi-Fi → cliquez sur le réseau connecté → "Détails..." →
l'adresse IP est affichée (ex: `192.168.0.5`).

**4. Accepter le certificat sur chaque appareil** qui utilisera `/caisse`
(Mac, iPad...) : ouvrez un nouvel onglet et allez sur
`https://<IP-du-Mac>:8099` (remplacez par l'IP trouvée à l'étape 3) —
acceptez l'avertissement "Connexion non privée". À refaire une fois par
appareil.

**5. Renseigner l'adresse du relais dans `/patron`** → Imprimantes : dans
le nouveau champ "Adresse du relais d'impression", pour chaque imprimante
(Comptoir et Cuisine), entrez :

```
https://<IP-du-Mac>:8099
```

Enregistrez. L'impression passe maintenant par le relais.

## Impression automatique des commandes du site public

Depuis le 2026-10-10, le relais va lui-même vérifier toutes les quelques
secondes si une commande du site public attend d'être imprimée, et
l'imprime directement — **sans dépendre d'aucun onglet ouvert** (`/caisse`
ou `/commandes` peuvent rester fermés, ça fonctionne quand même).

Pour l'activer, il faut donner au relais le même "mot de passe secret"
interne que le site (`AUTH_SECRET`, déjà présent dans `apps/web/.env.local`
— jamais à inventer ni communiquer à qui que ce soit d'autre) :

```bash
grep AUTH_SECRET ~/3sauces-website/apps/web/.env.local | cut -d= -f2- > auth-secret.txt
```

Relancez le relais (`Ctrl+C` puis `node relais.mjs`). Vous devez voir :

```
[relais][auto] impression automatique activée, vérifie https://www.3sauces.fr toutes les 8s.
```

Sans ce fichier, le relais continue de fonctionner normalement pour
l'impression manuelle depuis `/caisse` — seule l'impression automatique des
commandes du site public est désactivée.

## Garder le relais toujours actif

Fermer le Terminal arrête le relais, et donc l'impression. Deux options :

**Option simple** : laissez simplement cette fenêtre de Terminal ouverte en
permanence pendant le service, et relancez `node relais.mjs` si jamais le
Mac redémarre.

**Option automatique** (recommandée) : faites démarrer le relais tout seul
à l'ouverture de session, et le redémarrer automatiquement s'il plante.

```bash
# Adapter le chemin dans le fichier avant de l'installer :
sed -i '' "s|CHEMIN_VERS_relais.mjs|$(pwd)/relais.mjs|" com.3sauces.relais-impression.plist
cp com.3sauces.relais-impression.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.3sauces.relais-impression.plist
```

Le relais démarre alors automatiquement dès que le Mac est allumé et que
vous êtes connecté, sans avoir besoin d'ouvrir de Terminal. Pour vérifier
qu'il tourne : `https://<IP-du-Mac>:8099` doit répondre (même une erreur
"Route inconnue" en JSON suffit à confirmer qu'il écoute).

Pour l'arrêter : `launchctl unload ~/Library/LaunchAgents/com.3sauces.relais-impression.plist`
