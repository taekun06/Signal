# SIGNAL//ZÉRO

Jeu de transmission et d’interception de codes pour deux équipes, inspiré de *Decrypto*, dans l’univers d’un vieux terminal cathodique. Le phosphore est ambre pour une équipe et vert pour l’autre.

## Jouer

- **Un téléphone (disponible)** : les deux équipes se passent le même téléphone. Un écran de passage verrouille l’affichage entre chaque étape, pour qu’une équipe ne voie jamais les mots-clés de l’autre.
- **Deux téléphones** : une équipe par téléphone. Le premier ouvre un canal (code de 4 lettres et QR code), le second s’y branche en visant le QR code avec l’appareil photo ou en tapant le code. Les téléphones se parlent en direct (WebRTC), sans compte ni serveur à nous ; le service public gratuit de PeerJS sert seulement à ce qu’ils se trouvent. Sablier officiel de 30 secondes en option. Après une coupure, un rechargement ou une mise en veille, la liaison se rétablit d’elle-même et la partie reprend là où elle en était.

Règles appliquées : 2 joueurs minimum par équipe, crypteur désigné à tour de rôle, codes de 3 chiffres parmi 4, pas d’interception en manche 1, 2 interceptions pour gagner et 2 malentendus pour perdre (vérifiés en fin de manche), 8 manches au maximum, départage aux points puis par les mots adverses.

## Développer

```bash
npm install
npm run dev      # serveur local, accessible depuis le téléphone sur le même Wi-Fi
npm test         # tests du moteur de règles
npm run build    # version de production dans dist/
```

Tester le mode deux téléphones sans téléphone : ouvrir le jeu avec `?liaison=locale` dans deux onglets du même navigateur. `?liaison=127.0.0.1:9000` utilise à la place un serveur PeerJS lancé chez soi (`npx peer --port 9000`).

## Organisation du code

| Dossier | Rôle |
| --- | --- |
| `src/game/` | Moteur de règles pur et déterministe (`rules.ts`), liste de mots, tests |
| `src/net/` | Partie sur un téléphone (`localGame.ts`), liaison entre téléphones (`link.ts`) et partie à deux téléphones (`onlineGame.ts` : l’hôte arbitre, l’invité suit) |
| `src/fx/` | Sons synthétisés, vibrations, brouillage d’écran |
| `src/ui/` | Écrans Preact : démarrage, menu, équipes, indices, décodage, révélation, fin |
| `src/styles.css` | Univers CRT : lignes de balayage, grain, aberration chromatique, allumage |

Le moteur ne tire jamais au hasard par lui-même : la graine est stockée dans l’état de la partie. La même action produit donc le même résultat sur tous les appareils, ce qui prépare le mode en ligne.

## Mise en ligne

Chaque push sur `main` publie le jeu sur GitHub Pages (`.github/workflows/deploy.yml`). À activer une fois dans le dépôt : **Settings → Pages → Source : GitHub Actions**.
