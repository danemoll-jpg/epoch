# Leader portraits

The game shows each leader's portrait on the New Game cards, in first contact, in
Diplomacy, on demands and offers, on the victory progress cards, and on the victory and
defeat screens. A leader without a picture gets a placeholder: their initials on the civ's
color in a circle.

## Dan's 12 portraits (in place since Round 11)

Round 16: the game uses **WebP** copies (quality 90, about 850 KB for all 12 instead of
5.2 MB, so the offline download is about 4.4 MB smaller). They live in
`src/assets/portraits/`, named by civ id. **Dan's PNG originals are the masters**, kept in
`docs/portraits-master/<civ-id>.png`; `python scripts/make-portrait-webp.py` makes the
WebPs from them.

| Leader | Civ | File |
|---|---|---|
| Hatshepsut | Egypt | `egypt.webp` |
| Caligula | Rome | `rome.webp` |
| Charlemagne | Franks | `franks.webp` |
| Mansa Musa | Mali | `mali.webp` |
| Henry VIII | England | `england.webp` |
| Louis XIV | France | `france.webp` |
| Peter the Great | Russia | `russia.webp` |
| Simón Bolívar | Gran Colombia | `gran_colombia.webp` |
| John F. Kennedy | United States | `usa.webp` |
| Viktor Yushchenko | Ukraine | `ukraine.webp` |
| Angela Merkel | Germany | `germany.webp` |
| Kim Jong Un | North Korea | `north_korea.webp` |

## Making a new one (or replacing one)

- **Square, 512 × 512 px.** At least 256 px; a test fails on anything smaller or not square.
- **PNG master, made into WebP.** Put the PNG in `docs/portraits-master/<civ-id>.png`, then
  run `python scripts/make-portrait-webp.py`, which writes `src/assets/portraits/<civ-id>.webp`.
  (The game takes a PNG or WebP in `src/assets/portraits/`; if both exist, the `.webp` wins.)
- **The face in the upper middle, with some margin.** The picture is shown in a circle, so
  the corners are cut off.
- No code change is needed; the next build picks it up. (The play server needs a restart:
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

`docs/portraits.html` first shows each PNG master next to its WebP (Round 16), then all 12 leaders at every size the game uses (128, 96, 64, 48, 40,
36, 28 px), with the zoom applied at 48 px and under, next to the placeholder. On the iPad:
**http://10.0.0.224:4173/docs/portraits.html** (the play server copies it and the pictures
into its build).
