# Going live: Epoch: From Stone to Stars

Dan's steps, in order, to put the game on the internet and into the game hub. Nothing here
needs a command line. Each step says what you should see, so you know it worked.

**What's already done (by the coding agent, Round 15):**
- The `epoch` repo on GitHub (`danemoll-jpg/epoch`) has the latest game on `main`.
- `netlify.toml` in the repo tells Netlify everything: the build command
  (`npm install && npm run build`), the folder to publish (`dist`), the Node version (24), the
  single-page redirect, and the cache headers the offline mode needs. **You type no build
  settings.**
- `npm run build` makes the game with no dev code in it (the build fails if any slips in), and
  every icon, sound, portrait, and piece of music is bundled and credited (About / Credits in
  the game, and `CREDITS.md`).
- The game installs like an app (Add to Home Screen, with your icon) and plays offline once it's
  been opened. When a new version goes live, the game shows **"Update available: tap to
  reload"** and never reloads on its own.
- The hub card is drafted below. **The hub repo has not been touched.**

---

## 1. Create the Netlify site (about 5 minutes)

1. Go to https://app.netlify.com and log in (the same account as your other games).
2. **Add new site → Import an existing project.**
3. Pick **GitHub**. If Netlify asks to be allowed into your GitHub, allow it for the
   `danemoll-jpg/epoch` repository (or all repositories, as for your other games).
4. Choose **`danemoll-jpg/epoch`**.
5. The settings page fills itself in from `netlify.toml`: branch `main`, build command
   `npm install && npm run build`, publish directory `dist`. **Don't change anything.**
6. Click **Deploy**. The first build takes 1–3 minutes. You'll see "Published" when it's done.
   - If it says **Failed**, open the deploy log, copy the last 30 lines, and paste them to the
     coding agent.

## 2. Pick the address

1. **Site configuration → Change site name.**
2. Type a name, e.g. `epoch-stone-to-stars` (or `epochgame`, `epoch-dan`; any free name).
3. The game is now at **`https://<the name>.netlify.app/`**. Write it down: the hub card needs it.

## 3. Check it on the computer

1. Open the address. The main menu shows the gold **EPOCH** with **From Stone to Stars** under
   it, and the browser tab says **Epoch: From Stone to Stars** with your icon.
2. ☰ → About / Credits (or the main menu's About) says version **0.15.0**.
3. Start a game, play two turns, reload the page: **Continue** brings the game back.

## 4. Put it on the iPad's Home Screen

1. On the iPad, open the address in **Safari**.
2. Tap **Share** (the square with the arrow) → **Add to Home Screen**. The name shows as
   **Epoch** with your icon. Tap **Add**.
3. Open it from the Home Screen: it fills the screen with **no Safari bars**, in landscape and
   in portrait, and nothing sits under the camera or the home bar.
4. **Offline check:** after it has opened once, turn on Airplane Mode, close the game (swipe it
   away), and open it again from the Home Screen. It opens and plays. (Music you haven't heard
   yet on that iPad stays quiet until you're back online: it's saved the first time it plays.)

**Saves are per address.** The Netlify game has its own save, apart from the one on the play
server (`http://10.0.0.224:4173/`), and the Home Screen app keeps its own save apart from a
Safari tab on the same address (that's how the iPad works). A game in progress on the play server doesn't move over by itself; finish it
there, or start fresh on the live site. (Round 16's cloud saves will fix this.)

## 5. Add the card to the hub

In the hub repo (`danemoll-jpg/game-hub`), add this to the end of the list in `games.js`
(before the closing `];`), with **your real address** from step 2 in `url`:

```js
  {
    id: 'epoch',
    name: 'Epoch: From Stone to Stars',
    tagline: 'Lead a people from the first village to the stars: build cities, trade and fight with up to five rivals, and win by conquest, culture, wealth, or a flight to the stars.',
    icon: '🏛️',
    url: 'https://epoch-fsts.netlify.app/',
    tags: ['solo', 'strategy', '2–3 hours'],
    accent: '#4a7fd6',
  },
```

- **icon:** the hub cards use an emoji; 🏛️ fits (other choices: 🌟 or 🗿).
- **accent:** `#4a7fd6` is a brighter take on your icon's blue that shows on the hub's green
  felt (the icon's own `#001f57` is too dark there; Mexican Train and Nonogram Pro already use
  the gold).

Then commit, and push the hub **yourself, or tell the coding agent "push the hub"**. The hub is
live, so the push shows the card to everyone right away. **Only push after step 3 works**, so
the card never points at a site that isn't there.

## 6. Tell the planning session it's live

Say "Epoch is live at https://….netlify.app/". From then on:

- **Every push to the `epoch` repo deploys to the live site** within a couple of minutes, so the
  coding agent stops pushing at the end of each round: **pushing is your call again**
  (CLAUDE.md's pushing rules already say so, effective from your confirmation).
- Players (you included) see **"Update available: tap to reload"** after a deploy. Tapping it
  saves the game first, then loads the new version; saves and backups are untouched.

## If something goes wrong

- **A bad version went live:** Netlify → **Deploys** → click the last good one → **Publish
  deploy**. The old version is back in seconds; the game offers it as an update.
- **The iPad keeps showing an old version:** open the game, wait a few seconds for the update
  banner, and tap it. If there's still no banner, close the app fully and reopen it.
- **The Home Screen icon is the old one:** remove it and add it again (step 4).
