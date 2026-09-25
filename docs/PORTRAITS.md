# Leader portraits

The game shows each leader's portrait on the New Game cards, in first contact, in
Diplomacy, on demands and offers, on the victory progress cards, and on the victory and
defeat screens. A leader without a picture gets a placeholder: their initials on the civ's
color in a circle.

## Dan's 12 portraits (in place since Round 11)

They live in `src/assets/portraits/`, named by civ id:

| Leader | Civ | File |
|---|---|---|
| Hatshepsut | Egypt | `egypt.png` |
| Caligula | Rome | `rome.png` |
| Charlemagne | Franks | `franks.png` |
| Mansa Musa | Mali | `mali.png` |
| Henry VIII | England | `england.png` |
| Louis XIV | France | `france.png` |
| Peter the Great | Russia | `russia.png` |
| Simón Bolívar | Gran Colombia | `gran_colombia.png` |
| John F. Kennedy | United States | `usa.png` |
| Viktor Yushchenko | Ukraine | `ukraine.png` |
| Angela Merkel | Germany | `germany.png` |
| Kim Jong Un | North Korea | `north_korea.png` |

## Making a new one (or replacing one)

- **Square, 512 × 512 px.** At least 256 px; a test fails on anything smaller or not square.
- **PNG or WebP.** If both exist for a civ, the `.webp` is used.
- **The face in the upper middle, with some margin.** The picture is shown in a circle, so
  the corners are cut off.
- **Drop the file in `src/assets/portraits/`** with the exact file name from the table. No
  code change is needed; the next build picks it up. (The play server needs a restart:
  `npm run play:lan`.)

## Small sizes zoom in on the face

At 48 px and under (the top bar, the Diplomacy list, the victory cards), the game zooms in
on the face, so a portrait that shows a lot of body (Kim Jong Un, Merkel, Yushchenko, JFK)
still reads as a face. Each leader's focus is data: `portraitFocus` in `src/data/civs.ts`:

- `x`, `y`: where the face's center is, as a fraction of the picture's width and height
  (0.5, 0.5 is the middle; 0.25 for `y` is a quarter of the way down);
- `zoom`: how far to zoom in (1 = none, 2 = twice as close).

If you replace a picture and the face moves, adjust its `portraitFocus`, then check it on
the check page.

## The check page

`docs/portraits.html` shows all 12 leaders at every size the game uses (128, 96, 64, 48, 40,
36, 28 px), with the zoom applied at 48 px and under, next to the placeholder. On the iPad:
**http://10.0.0.224:4173/docs/portraits.html** (the play server copies it and the pictures
into its build).
