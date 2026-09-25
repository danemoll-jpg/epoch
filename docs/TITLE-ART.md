# Title screen art (Round 14, B4)

The main menu shows the **EPOCH** wordmark (text, in beaten gold since Round 14) over a
dark background. A picture behind it is optional. **The recommendation: Dan makes it with
an AI image generator**, the same way as the portraits. A painted scene suits the game far
better than anything drawn in code, and the game is ready for it: drop the file in and the
next build shows it. No code change.

## The file

| | Landscape (needed) | Portrait (optional) |
|---|---|---|
| File name | `title-background.jpg` | `title-background-portrait.jpg` |
| Size | **2048 × 1536 px** (4:3, like the iPad held sideways) | **1536 × 2048 px** (3:4) |
| Format | JPG (or WebP / PNG), **under 800 KB** | same |
| Where | `src/assets/title/` | same |

Without the portrait one, an upright iPad shows the landscape picture cropped to fit.

## How it's shown

- The picture fills the screen and is **cropped to fit** (like a phone wallpaper), always
  centered. On a wide desktop window the top and bottom get cut; on an upright iPad, the
  sides.
- **The middle 40% is darkened** (about 80%) so the menu buttons and text stay readable. The
  edges are darkened only a little (about 35%). So the picture shows best **at the sides and
  corners**; whatever is in the middle will be dim.
- The menu itself is a column about 460 px wide in the middle, with the wordmark at the top.

## Safe area and what to paint

- **No text or letters in the picture.** The wordmark is drawn by the game (it scales with
  the text-size setting and stays sharp).
- **Keep it dark overall** (a dusk or night sky, deep colors). The gold wordmark and the white
  button text need a dark background. A bright sky behind the wordmark would wash it out.
- **Put the interesting things left and right**, e.g. a city on a hill on one side and a
  harbor or ruins on the other, with a darker, calmer middle (sky, sea, or plain).
- **Our own look**, not Firaxis's or anyone else's: no copied scenes, logos, or characters.

## A starting prompt

> A wide painted fantasy-history landscape at dusk, seen from a hilltop: on the left an
> ancient stone city with temples and a lighthouse by the sea; on the right a distant modern
> skyline with a rocket on a launch tower, the two joined by a winding road through fields
> and forests. Deep blue and violet sky with the first stars, warm gold light on the
> horizon. Painterly, rich colors, soft light, a calm dark open sky in the center. No text,
> no letters, no people in the foreground. 4:3.

For the portrait version, ask for the same scene "tall, 3:4", with the city at the bottom
left and the skyline at the bottom right, and the dark sky taking the top two thirds.

## After adding it

The next build picks it up. On the play server that means a restart (the coding agent
restarts it at the end of every round). Open the main menu (☰ → Main menu) to see it.
