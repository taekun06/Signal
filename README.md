# SIGNAL//ZÉRO

Jeu de transmission et d’interception de codes pour deux équipes, inspiré de *Decrypto*, dans l’univers d’un vieux terminal cathodique. Le phosphore est ambre pour une équipe et vert pour l’autre.

## Jouer

- **Un téléphone (disponible)** : les deux équipes se passent le même téléphone. Un écran de passage verrouille l’affichage entre chaque étape, pour qu’une équipe ne voie jamais les mots-clés de l’autre.
- **Deux téléphones en ligne (prochaine étape)** : une équipe par téléphone, avec un code de salle ou un QR code, et le sablier officiel de 30 secondes.

Règles appliquées : 2 joueurs minimum par équipe, crypteur désigné à tour de rôle, codes de 3 chiffres parmi 4, pas d’interception en manche 1, 2 interceptions pour gagner et 2 malentendus pour perdre (vérifiés en fin de manche), 8 manches au maximum, départage aux points puis par les mots adverses.

## Développer

```bash
npm install
npm run dev      # serveur local, accessible depuis le téléphone sur le même Wi-Fi
npm test         # tests du moteur de règles
npm run build    # version de production dans dist/
```

## Organisation du code

| Dossier | Rôle |
| --- | --- |
| `src/game/` | Moteur de règles pur et déterministe (`rules.ts`), liste de mots, tests |
| `src/net/` | Stockage de la partie (`localGame.ts` pour un téléphone ; le mode en ligne viendra ici) |
| `src/fx/` | Sons synthétisés, vibrations, brouillage d’écran |
| `src/ui/` | Écrans Preact : démarrage, menu, équipes, indices, décodage, révélation, fin |
| `src/styles.css` | Univers CRT : lignes de balayage, grain, aberration chromatique, allumage |

Le moteur ne tire jamais au hasard par lui-même : la graine est stockée dans l’état de la partie. La même action produit donc le même résultat sur tous les appareils, ce qui prépare le mode en ligne.

## Mise en ligne

Chaque push sur `main` publie le jeu sur GitHub Pages (`.github/workflows/deploy.yml`). À activer une fois dans le dépôt : **Settings → Pages → Source : GitHub Actions**.
