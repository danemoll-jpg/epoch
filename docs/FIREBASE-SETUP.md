# Cloud saves: Firebase setup (Round 16)

Epoch's cloud saves use Dan's Firebase project **`epoch-ca127`** (free Spark plan):
Google sign-in and Cloud Firestore. The web config is in `src/data/firebase.ts`.
It isn't secret; the security rules are what keep each player's saves private.

Already done by Dan (2026-09-25): Google sign-in enabled, `epoch-fsts.netlify.app`
added as an authorized domain, Firestore created in production mode.

**Still to do, once each (about 5 minutes).** Do steps 1 and 2 before pushing
Round 16; the game works without them, but sign-in and saving will fail.

**Round 16b: publish the rules once more (step 1).** The first run against the
emulator found that the old rules let a save be written again at its own
revision (an unchanged entry passed as a "rename"). `firestore.rules` now refuses
that. The game works with either version, so this is safety, not a fix you need
before playing: paste the new `firestore.rules` and Publish, as in step 1.

## 1. Publish the security rules

Production mode starts with rules that refuse everything, so nothing can be
saved until these are published.

1. Open https://console.firebase.google.com/project/epoch-ca127/firestore/rules
   (Firebase console → **Build → Firestore Database → Rules** tab).
2. Delete what's in the editor, and paste in the whole of **`firestore.rules`**
   from the repo root (it starts with `rules_version = '2';`).
3. Click **Publish**.

What they allow: a signed-in player reads and writes only their own saves
(`users/<their id>/…`); at most 5 slots (`s1`–`s5`); each save at most 900 KB
gzipped (an Epic game at turn 217 is about 15 KB) and a name at most 40
characters; a slot's revision goes up by exactly 1 per write, so an older copy
can never quietly overwrite a newer one. Everything else is refused.

(Or, from a terminal in the repo: `firebase login`, then
`firebase deploy --only firestore:rules`. The repo's `firebase.json` and
`.firebaserc` point at the project.)

## 2. Allow sign-in to come back to the game's own address

Safari blocks the cross-site storage that Firebase's normal sign-in page
(`epoch-ca127.firebaseapp.com`) relies on, which breaks signing in on the iPad,
especially from the Home Screen icon. So the game serves that page from its own
address instead: `netlify.toml` passes `/__/auth/*` and `/__/firebase/*` through
to `epoch-ca127.firebaseapp.com`, and on `epoch-fsts.netlify.app` the game uses
that address as its `authDomain`. This is option 3 of Firebase's
"Best practices for using signInWithRedirect on browsers that block third-party
storage access" (https://firebase.google.com/docs/auth/web/redirect-best-practices,
checked 2026-09-25). Google must be told that this address may receive sign-ins:

1. Open https://console.cloud.google.com/apis/credentials?project=epoch-ca127
   (Google Cloud console → **APIs & Services → Credentials**; sign in with the
   same Google account as Firebase).
2. Under **OAuth 2.0 Client IDs**, click **Web client (auto created by Google
   Service)**.
3. Under **Authorized redirect URIs**, click **+ Add URI** and enter exactly:

   `https://epoch-fsts.netlify.app/__/auth/handler`

   (Leave the existing `https://epoch-ca127.firebaseapp.com/__/auth/handler`
   there; it's what localhost uses.)
4. Click **Save**. It can take a few minutes to take effect.

## 3. Check the authorized domains (already done)

Firebase console → **Authentication → Settings → Authorized domains** should list
`localhost`, `epoch-ca127.firebaseapp.com`, and `epoch-fsts.netlify.app`.
Nothing to add. (The LAN play server, `http://10.0.0.224:4173`, isn't one: cloud
saves are for the live site. Signing in there just says it doesn't work at that
address; the game plays as always.)

## After pushing: try it

1. On the PC, open https://epoch-fsts.netlify.app/, tap **Sign in with Google**
   on the main menu (or ☰ → Settings → Cloud saves). A Google window opens; pick
   your account. The main menu then says "Signed in as …", and a small ☁✓ shows
   by the game's name in the top bar.
2. Play a few turns. After each End Turn the mark shows ☁… then ☁✓.
3. On the iPad, in Safari, sign in the same way. The main menu lists the PC's
   game ("last played … on PC"); **Continue** opens the newest one.
4. From the Home Screen icon: sign-in leaves the game for Google's page and comes
   back to the game signed in (that's the redirect; there's no popup there).
5. To see the keep-which question: play a turn on each device while the other
   one is in the background, then bring the first back. It asks which to keep;
   the other goes into ☰ → Restore a backup.

## If something goes wrong

- **"Cloud saves unavailable"**: Firebase couldn't load (offline on first use,
  or a content blocker). The game plays and saves on the device as always.
- **Sign-in says it doesn't work at this address**: the address isn't an
  authorized domain (step 3).
- **Sign-in on the iPad goes to Google and comes back signed out**: step 2 isn't
  done yet (or hasn't taken effect). Since Round 16b the game says "Sign-in
  failed. Please try again." whenever that happens, and ☰ → Settings → Cloud
  saves shows how the last try ended ("Last try: …, redirect, came back without
  signing in"), with Firebase's code when there is one.
- **The mark stays ☁… or shows "Couldn't sync: will retry"**: the rules aren't
  published (step 1); check with `window.__epoch.app.cloud.sync.log` in the
  browser console.

## Testing the rules (for the coding agent)

`npm run test:rules` (`scripts/test-rules.mjs`) runs `tests/firestore-rules.test.ts`
against the Firestore emulator (`firebase-tools` 15 through npx, which needs **Java 21
or newer**). This PC's system Java is 8, so Round 16b unpacked a portable Java 21
(Temurin JRE, no admin) into `%LOCALAPPDATA%\epoch-tools\`; the script puts it on
PATH when it's there. **6 pass (2026-09-25).** In a plain `npm test` those tests are
skipped; the same rules are checked against the in-memory store in `tests/cloud.test.ts`.
