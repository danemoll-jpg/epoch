// Round 16: cloud saves on screen. Sign-in and sign-out (main menu and Settings), the cloud games
// on the main menu (open, rename, delete), the keep-which question, and the quiet status mark.
// The sync rules themselves are in src/cloud/sync.ts; Firebase is loaded only when needed
// (src/cloud/backend.ts), so a player who never signs in never downloads it.
//
// Local saves stay primary: the App saves to the device exactly as before, with this game's
// link to its cloud slot (`link`) inside the save file.

import { loadFirebase, SIGN_IN_FAILED, type CloudBackend, type CloudUser, type RedirectOutcome, type SignInOutcome } from '../cloud/backend';
import { gunzipText } from '../cloud/compress';
import { CloudSync, defaultSlotName, STATUS_TEXT, type SlotMeta, type SlotSave, type SyncOutcome, type SyncStatus } from '../cloud/sync';
import { CLOUD } from '../data/firebase';
import { DIFFICULTIES } from '../data/difficulty';
import { MAP_SIZES } from '../data/mapSizes';
import { deserializeGame, serializeGame, type CloudLink } from '../game/save';
import type { GameState } from '../game/types';
import { portraitHtml } from './portraits';
import { backupText, type KeyValueStore } from './storage';
import { esc } from './text';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Per device, apart from saves: was the player signed in (so Firebase loads at startup)? */
export const CLOUD_PREFS_KEY = 'epoch.cloud';
interface CloudPrefs {
  signedIn?: boolean;
  /** A redirect sign-in is on its way back. */
  pending?: boolean;
  /** Round 16b: how the last sign-in attempt on this device ended (to diagnose the iPad). */
  lastSignIn?: SignInRecord;
}

/** Round 16b: one sign-in attempt, kept on the device and shown in Settings while signed out. */
export interface SignInRecord {
  at: number;
  how: 'popup' | 'redirect';
  result: 'done' | 'cancelled' | 'notFinished' | 'failed';
  code?: string;
}

/** Round 16b: what the player is told when a sign-in ends; undefined when it worked (or is on its way). */
export function signInMessage(out: SignInOutcome | RedirectOutcome): string | undefined {
  if (out.kind === 'cancelled' || out.kind === 'none') return SIGN_IN_FAILED;
  if (out.kind === 'failed') return out.message;
  return undefined;
}

/**
 * Round 16b: the main menu's account line, so signed in or not is plain at a glance ("☁ Signed
 * in as Dan", or "Not signed in" with the button). `hasGame`: is there a game on this device?
 */
export function accountHtml(o: { user: CloudUser | null; status: SyncStatus; signingIn: boolean; hasGame: boolean }): string {
  if (o.user) {
    return `<div class="cloudAcct in"><span>☁ Signed in as <b>${esc(o.user.name)}</b><span class="sub"> · ${esc(STATUS_TEXT[o.status])}</span></span><button type="button" data-cloud="signOut">Sign out</button></div>`;
  }
  if (o.status === 'unavailable') return `<div class="cloudAcct sub">${esc(STATUS_TEXT.unavailable)}</div>`;
  const btn = o.signingIn
    ? '<button type="button" data-cloud="signIn" class="primary" disabled>Signing in…</button>'
    : '<button type="button" data-cloud="signIn" class="primary">Sign in with Google</button>';
  const hint = o.hasGame ? '' : '<p class="cloudHint">Looking for a game from another device? Sign in with Google.</p>';
  return `<div class="cloudAcct out"><span><b>Not signed in</b>: sign in to see your cloud games.</span>${btn}</div>${hint}`;
}

const SIGN_IN_RESULT_TEXT: Record<SignInRecord['result'], string> = {
  done: 'signed in',
  cancelled: 'closed before it finished',
  notFinished: 'came back without signing in',
  failed: 'failed',
};

/** What the controller needs from the App. */
export interface CloudHost {
  state(): GameState;
  /** Is there a real game to sync (not the stand-in behind the main menu)? */
  syncable(): boolean;
  /** Save the game to the device again (its link changed). */
  saveLocal(): void;
  /** Swap in another game (the one replaced has been backed up already). */
  replaceGame(state: GameState, message: string): void;
  /** Close the main menu and play. */
  play(): void;
  toast(text: string, bad?: boolean): void;
  /** The rivals are moving: the game can't be swapped now. */
  busy(): boolean;
  menuOpen(): boolean;
  refreshMenu(): void;
  refreshSettings(): void;
}

export interface CloudOptions {
  /** The loaded game's link (from its save file), if it has one. */
  link?: CloudLink;
  /** When the loaded game was last saved (ms). */
  savedAt?: number;
  /** Where backups go: the device's localStorage, or memory in a dev scenario. */
  localStore?: KeyValueStore;
  /** Where the signed-in flag is kept; null: nowhere (a dev scenario). */
  prefsStore?: KeyValueStore | null;
  /** The cloud to use: Firebase, or a dev scenario's stand-in. */
  backend?: () => Promise<CloudBackend | undefined>;
  device: string;
}

/** A new game's link: a fresh id, never synced. */
export function freshLink(): CloudLink {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return { gameId: id, syncedRev: 0, dirty: true };
}

/** "Today 9:41 PM", "Yesterday 8:02 AM", "Sep 21". */
export function whenText(ms: number, now: number): string {
  const d = new Date(ms);
  const day = (t: number) => new Date(t).toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (day(ms) === day(now)) return `Today ${time}`;
  if (day(ms) === day(now - 86_400_000)) return `Yesterday ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) });
}

/** One game on the main menu. */
export interface MenuEntry {
  kind: 'local' | 'cloud';
  /** The cloud slot (for a cloud entry, or the local game's own slot when it's in step with it). */
  slot?: string;
  name: string;
  civId: string;
  leader: string;
  civName: string;
  turn: number;
  era: string;
  mapSize: string;
  difficulty: string;
  savedAt: number;
  device: string;
  where: string;
}

/**
 * The games for the main menu: the one on this device, and each cloud slot. The cloud copy of
 * the game on this device is folded into it while they're in step; a newer cloud copy shows on
 * its own. Newest first.
 */
export function menuEntries(local: MenuEntry | undefined, link: CloudLink | undefined, slots: SlotMeta[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  let localWhere = 'On this device';
  for (const m of slots) {
    const same = !!link && link.slot === m.slot && link.gameId === m.gameId;
    if (local && same && m.rev === link!.syncedRev) {
      localWhere = link!.dirty ? 'On this device (newer than its cloud copy)' : 'On this device and in the cloud';
      continue;
    }
    out.push({ ...m, kind: 'cloud', where: same ? 'In the cloud (newer than this device’s)' : 'In the cloud' });
  }
  if (local) out.push({ ...local, where: localWhere, ...(link?.slot ? { slot: link.slot } : {}) });
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export class CloudController {
  link: CloudLink;
  /** Goes up with every change to the game (the sync uses it to know a write is stale). */
  changes = 0;
  localSavedAt: number;
  user: CloudUser | null = null;
  status: SyncStatus = 'signedOut';
  sync: CloudSync | undefined;
  private backend: CloudBackend | undefined;
  private loading: Promise<CloudBackend | undefined> | undefined;
  /** The cloud slots, as last listed (undefined: not yet). */
  slots: SlotMeta[] | undefined;
  private readonly local: KeyValueStore | undefined;
  private readonly prefsStore: KeyValueStore | null | undefined;
  private readonly makeBackend: () => Promise<CloudBackend | undefined>;
  private readonly device: string;
  private busyOp = false;
  /** Round 16b: a sign-in is under way (the button says "Signing in…"). */
  signingIn = false;
  /** Round 16b: a sign-in was started on this page or came back from a redirect: say when it lands. */
  private announceSignIn = false;

  constructor(
    private readonly host: CloudHost,
    opts: CloudOptions,
  ) {
    this.link = opts.link ?? freshLink();
    this.localSavedAt = opts.savedAt ?? Date.now();
    this.local = opts.localStore;
    this.prefsStore = opts.prefsStore;
    this.makeBackend = opts.backend ?? loadFirebase;
    this.device = opts.device;
    $('cloudOverlay').addEventListener('click', (e) => this.handleOverlayClick(e));
    $('cloudBadge').addEventListener('click', () => this.openStatus());
  }

  // ---- prefs ----

  private prefs(): CloudPrefs {
    try {
      const raw = this.prefsStore === undefined ? localStorage.getItem(CLOUD_PREFS_KEY) : this.prefsStore?.getItem(CLOUD_PREFS_KEY);
      return raw ? (JSON.parse(raw) as CloudPrefs) : {};
    } catch {
      return {};
    }
  }
  private setPrefs(p: CloudPrefs): void {
    try {
      const text = JSON.stringify(p);
      if (this.prefsStore === undefined) localStorage.setItem(CLOUD_PREFS_KEY, text);
      else this.prefsStore?.setItem(CLOUD_PREFS_KEY, text);
    } catch {
      // Storage blocked: the player just signs in again next time.
    }
  }

  // ---- starting up, signing in and out ----

  /** At startup: loads the cloud if the player was signed in (or is coming back from signing in). */
  start(force = false): void {
    const p = this.prefs();
    this.renderBadge();
    if (force || p.signedIn || p.pending) void this.ensureBackend();
  }

  private ensureBackend(): Promise<CloudBackend | undefined> {
    if (!this.loading) {
      this.loading = this.makeBackend().then(async (b) => {
        this.backend = b;
        if (!b) {
          this.setStatus('unavailable');
          return undefined;
        }
        b.onUser((u) => this.onUser(u));
        if (this.prefs().pending) {
          // Round 16b: coming back from a redirect sign-in (the Home Screen icon): never silent.
          const out = await b.redirectResult();
          const rec: SignInRecord = {
            at: Date.now(),
            how: 'redirect',
            result: out.kind === 'done' ? 'done' : out.kind === 'none' ? 'notFinished' : 'failed',
            ...(out.kind === 'failed' && out.code ? { code: out.code } : {}),
          };
          console.info('Epoch: redirect sign-in came back:', rec);
          this.setPrefs({ ...this.prefs(), pending: false, lastSignIn: rec });
          const msg = signInMessage(out);
          if (msg) this.host.toast(msg, true);
          else if (this.user) this.host.toast(`☁ Signed in as ${this.user.name}`);
          else this.announceSignIn = true;
        }
        return b;
      });
    }
    return this.loading;
  }

  private onUser(u: CloudUser | null): void {
    const was = this.user?.uid;
    this.user = u;
    if (!u) {
      this.sync = undefined;
      this.slots = undefined;
      const p = this.prefs();
      this.setPrefs({ ...(p.pending ? { pending: true } : {}), ...(p.lastSignIn ? { lastSignIn: p.lastSignIn } : {}) });
      this.setStatus('signedOut');
      return;
    }
    this.setPrefs({ ...this.prefs(), signedIn: true });
    if (this.announceSignIn) {
      this.announceSignIn = false;
      this.host.toast(`☁ Signed in as ${u.name}`);
    }
    if (was === u.uid && this.sync) return;
    this.sync = new CloudSync(this.backend!.store(u.uid), u.uid, {
      current: () => (this.host.syncable() ? { state: this.host.state(), link: this.link, changes: this.changes } : undefined),
      setLink: (l) => {
        this.link = l;
        this.host.saveLocal();
        void this.refreshSlots();
      },
      take: (save) => void this.takeCloud(save, 'quiet'),
      conflict: (cloud) => this.askConflict(cloud),
      status: (s) => this.setStatus(s),
      // Round 16b: signing in with a game in progress (or a new game's first write) says so.
      uploaded: (m) => this.host.toast(`☁ This game is now saved in the cloud too: “${m.name}” (slot ${m.slot.slice(1)} of ${CLOUD.maxSlots})`),
      now: () => Date.now(),
      online: () => navigator.onLine,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as number),
      device: this.device,
    });
    this.setStatus('saved');
    void this.refreshSlots().then(() => this.check());
  }

  async signIn(): Promise<void> {
    if (this.signingIn) return;
    this.signingIn = true;
    this.refreshViews();
    try {
      const b = await this.ensureBackend();
      if (!b) {
        this.host.toast('Cloud saves unavailable right now. Your game is saved on this device as always.', true);
        return;
      }
      this.setPrefs({ ...this.prefs(), pending: true });
      this.announceSignIn = true;
      const out = await b.signIn();
      if (out.kind === 'redirecting') return; // the page leaves, and comes back through ensureBackend
      const rec: SignInRecord = {
        at: Date.now(),
        how: 'popup',
        result: out.kind === 'done' ? 'done' : out.kind === 'cancelled' ? 'cancelled' : 'failed',
        ...(out.kind !== 'done' && out.code ? { code: out.code } : {}),
      };
      console.info('Epoch: sign-in ended:', rec);
      this.setPrefs({ ...this.prefs(), pending: false, lastSignIn: rec });
      // Round 16b: a sign-in that doesn't finish is never silent.
      const msg = signInMessage(out);
      if (msg) {
        this.announceSignIn = false;
        this.host.toast(msg, true);
      }
      // 'done' arrives through onUser, which says "Signed in as …".
    } finally {
      this.signingIn = false;
      this.refreshViews();
    }
  }

  /** The main menu and Settings show the sign-in button's state. */
  private refreshViews(): void {
    this.host.refreshSettings();
    if (this.host.menuOpen()) this.host.refreshMenu();
  }

  async signOut(): Promise<void> {
    // Anything waiting goes up first, then the cloud is left alone; this device keeps its game.
    this.request();
    await this.backend?.signOut();
    this.host.toast('Signed out. Your game stays on this device.');
  }

  // ---- the App's hooks ----

  /** The game changed (after any successful action). */
  markChanged(): void {
    this.link = { ...this.link, dirty: true };
    this.changes++;
    this.localSavedAt = Date.now();
  }

  /** After End Turn, and when the game is hidden: write the cloud copy in the background. */
  request(): void {
    this.sync?.request();
  }

  /** Coming back to the game, opening it, or signing in: compare with the cloud. */
  async check(): Promise<void> {
    if (!this.sync || this.host.busy()) return;
    await this.sync.check();
  }

  kick(): void {
    this.sync?.kick();
  }

  /**
   * New Game: a new game gets its own link (and a new slot on its first write). Called before
   * the App swaps the game in; the App asks for the write (`request`) after.
   */
  newGame(): void {
    this.link = freshLink();
    this.changes++;
    this.localSavedAt = Date.now();
  }

  /**
   * A restored backup: it counts as changed here, so a newer cloud copy is never taken over it
   * quietly (the player is asked). Called before the swap; the App calls `check` after.
   */
  restored(link: CloudLink | undefined): void {
    this.link = link ? { ...link, dirty: true } : freshLink();
    this.changes++;
    this.localSavedAt = Date.now();
  }

  // ---- status ----

  private setStatus(s: SyncStatus): void {
    this.status = s;
    this.renderBadge();
    const line = document.getElementById('menuCloud');
    if (line) line.textContent = this.statusLine();
    this.host.refreshSettings();
    if (this.host.menuOpen()) this.host.refreshMenu();
  }

  statusLine(): string {
    if (this.user) return `Cloud saves: ${STATUS_TEXT[this.status]} · signed in as ${this.user.name}`;
    return this.status === 'unavailable' ? STATUS_TEXT.unavailable : 'Cloud saves: not signed in (your game is saved on this device)';
  }

  private renderBadge(): void {
    const b = $('cloudBadge');
    b.hidden = !this.user;
    const mark: Partial<Record<SyncStatus, string>> = { saved: '☁✓', syncing: '☁…', offline: '☁⤫', retrying: '☁…', conflict: '☁?', full: '☁!' };
    b.textContent = mark[this.status] ?? '☁';
    b.className = `cloud-${this.status}`;
    b.setAttribute('aria-label', STATUS_TEXT[this.status]);
    b.title = STATUS_TEXT[this.status];
  }

  // ---- the cloud slots ----

  async refreshSlots(): Promise<void> {
    if (!this.sync) return;
    try {
      this.slots = await this.sync.store.list();
    } catch {
      // Offline: the menu shows what it listed last.
    }
    if (this.host.menuOpen()) this.host.refreshMenu();
  }

  /** The games for the main menu, newest first (the device's game only when there is one). */
  entries(local: Omit<MenuEntry, 'kind' | 'where' | 'savedAt' | 'device' | 'name'> | undefined): MenuEntry[] {
    const mine = local ? { ...local, kind: 'local' as const, name: `${local.leader} of ${local.civName}`, savedAt: this.localSavedAt, device: this.device, where: '' } : undefined;
    return menuEntries(mine, this.user ? this.link : undefined, this.user ? (this.slots ?? []) : []);
  }

  /**
   * The main menu's cloud part: who's signed in (or plainly "Not signed in"), and while signed
   * in, the games here and in the cloud. `hasGame`: is there a game on this device?
   */
  menuHtml(entries: MenuEntry[], hasGame: boolean): string {
    const account = accountHtml({ user: this.user, status: this.status, signingIn: this.signingIn, hasGame });
    if (!this.user) return account;
    const note = !this.slots ? 'Looking for your cloud games…' : this.slots.length ? `${this.slots.length} of ${CLOUD.maxSlots} cloud slots used` : 'No games in the cloud yet.';
    const list = entries.length ? `<div class="cloudList">${entries.map((e) => this.entryHtml(e)).join('')}</div>` : '';
    return `${account}${list}<div class="sub cloudNote">${note}</div>`;
  }

  /** Round 16b: the line at the top of ☰ → Restore a backup. */
  backupsHtml(): string {
    if (this.user) return `<p class="sub">☁ Your cloud games are on the main menu (signed in as ${esc(this.user.name)}).</p>`;
    if (this.status === 'unavailable') return '';
    return `<div class="cloudAcct out"><span>Cloud games are on the main menu once you sign in. <b>Looking for a game from another device?</b></span>${
      this.signingIn ? '<button type="button" data-cloud="signIn" disabled>Signing in…</button>' : '<button type="button" data-cloud="signIn" class="primary">Sign in with Google</button>'
    }</div>`;
  }

  get signedIn(): boolean {
    return !!this.user && !!this.sync;
  }

  // ---- Round 16b: Save now, Sync now, a copy in a new slot, and the ☁ panel ----

  /** ☰ → Save now's cloud half: writes the cloud copy now. Undefined when not signed in. */
  async saveNow(): Promise<SyncOutcome | undefined> {
    if (!this.user || !this.sync) return undefined;
    return this.sync.syncNow();
  }

  /** The ☁ panel's Sync now: compares with the cloud (it may pick up another device's turns), then writes. */
  async syncNow(): Promise<void> {
    if (!this.sync) return;
    if (this.host.busy()) {
      this.host.toast('The rivals are still moving. Try Sync now again once they’re done.');
      return;
    }
    this.host.toast('Syncing…');
    await this.sync.check();
    const r = await this.sync.syncNow();
    this.host.toast(r.ok ? '☁ Synced ✓ The cloud copy is up to date.' : `Not synced: ${r.message}`, !r.ok);
    void this.refreshSlots();
  }

  /** The ☁ mark: the status in words, when it last worked, the last problem, and Sync now. */
  openStatus(): void {
    const sync = this.sync;
    const now = Date.now();
    const who = this.user ? `<p>☁ Signed in as <b>${esc(this.user.name)}</b></p>` : '<p><b>Not signed in</b></p>';
    const ok = sync?.lastOkAt ? `Last saved to the cloud: ${esc(whenText(sync.lastOkAt, now))}` : 'Not saved to the cloud yet since the game opened.';
    const err = sync?.lastError ? `<p class="warn">Last problem (${esc(whenText(sync.lastError.at, now))}): ${esc(sync.lastError.text)}</p>` : '';
    this.showPanel(
      'Cloud saves',
      `${who}<p>${esc(STATUS_TEXT[this.status])}</p><p class="sub">${ok}</p>${err}`,
      [{ label: 'Close' }, ...(sync ? [{ label: 'Sync now', cls: 'primary', run: () => void this.syncNow() }] : [])],
    );
  }

  /** ☰ → Save to a new cloud slot…: a named copy of the game as it is now, as a game of its own. */
  askSaveCopy(): void {
    if (!this.sync) {
      this.host.toast('Sign in first (on the main menu) to save to the cloud.', true);
      return;
    }
    if (this.slots && this.slots.length >= CLOUD.maxSlots) {
      this.host.toast(`The cloud is full (${CLOUD.maxSlots} games). Delete one on the main menu first.`, true);
      return;
    }
    const st = this.host.state();
    const name = `${defaultSlotName(st)}, turn ${st.turn}`.slice(0, CLOUD.maxNameLength);
    this.showPanel(
      'Save to a new cloud slot',
      `<p>A copy of the game as it is now, kept in the cloud as a game of its own (for example before a risky move). This game carries on in its own slot.</p>
       <input id="cloudName" type="text" maxlength="${CLOUD.maxNameLength}" value="${esc(name)}" aria-label="Name" autocomplete="off" spellcheck="false">
       <p class="sub">${this.slots ? `${this.slots.length} of ${CLOUD.maxSlots} cloud slots used. ` : ''}Open it later from the main menu.</p>`,
      [
        { label: 'Cancel' },
        { label: 'Save copy', cls: 'primary', run: (v) => void this.saveCopy((v ?? '').trim() || name) },
      ],
    );
  }

  async saveCopy(name: string): Promise<SyncOutcome> {
    if (!this.sync) return { ok: false, message: 'Not signed in.' };
    this.host.toast('Saving a copy…');
    const r = await this.sync.saveCopy(name, freshLink().gameId);
    this.host.toast(r.ok ? `☁ Saved a copy as “${name}” (slot ${r.slot?.slice(1)} of ${CLOUD.maxSlots}). Your game carries on as before.` : `Couldn’t save the copy: ${r.message}`, !r.ok);
    await this.refreshSlots();
    return r;
  }

  private entryHtml(e: MenuEntry): string {
    const d = DIFFICULTIES[e.difficulty as keyof typeof DIFFICULTIES]?.name ?? e.difficulty;
    const size = MAP_SIZES[e.mapSize as keyof typeof MAP_SIZES]?.name ?? e.mapSize;
    const title = e.name !== `${e.leader} of ${e.civName}` ? `<b>${esc(e.name)}</b><span>${esc(e.leader)} of ${esc(e.civName)}</span>` : `<b>${esc(e.name)}</b>`;
    const btns = e.kind === 'cloud'
      ? `<button type="button" data-cloud="open" data-slot="${e.slot}" class="primary">Open</button><button type="button" data-cloud="rename" data-slot="${e.slot}">Rename</button><button type="button" data-cloud="delete" data-slot="${e.slot}">Delete</button>`
      : e.slot
        ? `<button type="button" data-cloud="continue" class="primary">Play</button><button type="button" data-cloud="rename" data-slot="${e.slot}">Rename</button><button type="button" data-cloud="delete" data-slot="${e.slot}">Delete</button>`
        : `<button type="button" data-cloud="continue" class="primary">Play</button>`;
    return `<div class="cloudGame ${e.kind}">${portraitHtml(e.civId, 48)}<div class="cgText">${title}
      <span class="sub">Turn ${e.turn} · ${esc(e.era)} era · ${esc(d)} · ${esc(size)} map</span>
      <span class="sub">${esc(e.where)} · last played ${esc(whenText(e.savedAt, Date.now()))} on ${esc(e.device)}</span></div>
      <div class="cgBtns">${btns}</div></div>`;
  }

  /** A click on a `data-cloud` button (main menu or Settings). True if it was one. */
  handleClick(btn: HTMLElement): boolean {
    const act = btn.dataset.cloud;
    if (!act) return false;
    const slot = btn.dataset.slot;
    if (act === 'signIn') void this.signIn();
    else if (act === 'signOut') void this.signOut();
    else if (act === 'continue') this.host.play();
    else if (act === 'open' && slot) void this.openSlot(slot);
    else if (act === 'rename' && slot) this.askRename(slot);
    else if (act === 'delete' && slot) this.askDelete(slot);
    return true;
  }

  /** Opens a cloud game: the game on this device is backed up first. */
  async openSlot(slot: string): Promise<void> {
    if (!this.sync || this.busyOp) return;
    if (this.host.busy()) {
      this.host.toast('The rivals are still moving. Try again in a moment.');
      return;
    }
    this.busyOp = true;
    try {
      const save = await this.sync.store.read(slot);
      if (!save) {
        this.host.toast('That cloud game is gone.', true);
        await this.refreshSlots();
        return;
      }
      if (await this.takeCloud(save, 'open')) this.host.play();
    } catch {
      this.host.toast('Couldn’t reach the cloud. Check the network and try again.', true);
    } finally {
      this.busyOp = false;
    }
  }

  /**
   * Makes the cloud copy the game on this device: the game here goes into the backups first
   * (unless it's only the stand-in behind the menu). False if it couldn't be.
   */
  private async takeCloud(save: SlotSave, why: 'quiet' | 'open' | 'chosen'): Promise<boolean> {
    if (this.host.busy()) return false;
    const text = await gunzipText(save.data);
    const res = deserializeGame(text);
    if (res.kind !== 'ok') {
      this.host.toast(res.kind === 'incompatible' ? 'That cloud game was saved by a newer version of the game. Reload to update, then try again.' : 'That cloud game couldn’t be read.', true);
      return false;
    }
    const m = save.meta;
    if (this.host.syncable()) {
      const now = Date.now();
      const reason = why === 'open' ? `Replaced by opening “${m.name}” from the cloud` : `Replaced by the cloud copy (turn ${m.turn}, ${m.device})`;
      if (!backupText(serializeGame(this.host.state(), this.localSavedAt, this.link), reason, now, this.local)) {
        this.host.toast('Couldn’t back up the game on this device (storage is full), so it was kept.', true);
        return false;
      }
    }
    this.link = { gameId: m.gameId, slot: m.slot, ...(this.user ? { uid: this.user.uid } : {}), syncedRev: m.rev, dirty: false };
    this.changes++;
    this.localSavedAt = m.savedAt;
    const msg =
      why === 'quiet'
        ? `Picked up where you left off on the ${m.device} (turn ${m.turn})`
        : why === 'chosen'
          ? `Kept the cloud’s game (turn ${m.turn}). This device’s is in the backups.`
          : `Opened “${m.name}” (turn ${m.turn})`;
    this.host.replaceGame(res.state, res.migratedFrom ? `${msg}; it was updated for this version` : msg);
    this.setStatus('saved');
    return true;
  }

  // ---- the keep-which question, rename, delete (their own panel, above the main menu) ----

  private panelButtons: { label: string; cls?: string; run?: (input?: string) => void }[] = [];

  private panelKind: 'conflict' | 'rename' | 'delete' | undefined;

  private showPanel(title: string, html: string, buttons: typeof this.panelButtons, kind?: 'conflict' | 'rename' | 'delete'): void {
    this.panelKind = kind;
    $('cloudTitle').textContent = title;
    $('cloudBody').innerHTML = html;
    this.panelButtons = buttons;
    $('cloudButtons').innerHTML = buttons.map((b, i) => `<button type="button" data-i="${i}" class="${b.cls ?? ''}">${esc(b.label)}</button>`).join('');
    $('cloudOverlay').hidden = false;
    ($('cloudBody').querySelector('input') as HTMLInputElement | null)?.focus();
  }

  private handleOverlayClick(e: MouseEvent): void {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('#cloudButtons button');
    if (!btn) return;
    const b = this.panelButtons[Number(btn.dataset.i)];
    const input = ($('cloudBody').querySelector('input') as HTMLInputElement | null)?.value;
    $('cloudOverlay').hidden = true;
    b?.run?.(input);
  }

  private copyLine(label: string, turn: number, savedAt: number, device: string): string {
    return `<div class="cloudCopy"><b>${esc(label)}</b><span>Turn ${turn} · ${esc(whenText(savedAt, Date.now()))} · ${esc(device)}</span></div>`;
  }

  askConflict(cloud: SlotMeta): void {
    // Already asking (the game came back into view meanwhile): leave the question as it is.
    if (!$('cloudOverlay').hidden && this.panelKind === 'conflict') return;
    const here = this.host.state();
    this.showPanel(
      'Which game do you want to keep?',
      `<p>This game was played on another device too, so there are two different versions.</p>
       ${this.copyLine('On this device', here.turn, this.localSavedAt, this.device)}
       ${this.copyLine('In the cloud', cloud.turn, cloud.savedAt, cloud.device)}
       <p class="sub">The one you don’t keep is saved as a backup (☰ → Restore a backup).</p>`,
      [
        { label: 'Keep this device’s', cls: 'primary', run: () => void this.resolveConflict('local', cloud) },
        { label: 'Keep the cloud’s', cls: 'primary', run: () => void this.resolveConflict('cloud', cloud) },
        { label: 'Decide later', run: () => this.host.toast('Nothing is synced until you choose. You’ll be asked again.') },
      ],
      'conflict',
    );
  }

  private async resolveConflict(keep: 'local' | 'cloud', cloud: SlotMeta): Promise<void> {
    const sync = this.sync;
    if (!sync) return;
    let save: SlotSave | undefined;
    try {
      save = await sync.store.read(cloud.slot);
    } catch {
      this.host.toast('Couldn’t reach the cloud, so nothing changed. You’ll be asked again.', true);
      return;
    }
    if (!save) {
      // The cloud copy was deleted meanwhile: nothing to lose; this device's game goes up.
      sync.keepLocal({ ...cloud, rev: 0 });
      return;
    }
    if (keep === 'cloud') {
      if (await this.takeCloud(save, 'chosen')) sync.keptCloud();
      return;
    }
    // Keep this device's: the cloud's version goes into the backups first, then gets overwritten.
    const text = await gunzipText(save.data);
    if (!backupText(text, `Cloud copy not kept (turn ${save.meta.turn}, ${save.meta.device})`, Date.now(), this.local)) {
      this.host.toast('Couldn’t back up the cloud copy (storage is full), so nothing changed.', true);
      return;
    }
    sync.keepLocal(save.meta);
    this.host.toast(`Kept this device’s game. The cloud’s (turn ${save.meta.turn}) is in the backups.`);
  }

  private slotMeta(slot: string): SlotMeta | undefined {
    return this.slots?.find((m) => m.slot === slot);
  }

  private askRename(slot: string): void {
    const m = this.slotMeta(slot);
    if (!m) return;
    this.showPanel(
      'Rename this game',
      `<input id="cloudName" type="text" maxlength="${CLOUD.maxNameLength}" value="${esc(m.name)}" aria-label="Name" autocomplete="off" spellcheck="false">`,
      [
        { label: 'Cancel' },
        {
          label: 'Rename',
          cls: 'primary',
          run: (v) => {
            const name = (v ?? '').trim().slice(0, CLOUD.maxNameLength);
            if (!name || !this.sync || name === m.name) return;
            this.sync.store.rename(slot, name).then(
              () => this.refreshSlots(),
              () => this.host.toast('Couldn’t reach the cloud to rename it. Try again.', true),
            );
          },
        },
      ],
    );
  }

  private askDelete(slot: string): void {
    const m = this.slotMeta(slot);
    if (!m) return;
    const here = this.link.slot === slot && this.link.gameId === m.gameId;
    this.showPanel(
      `Delete “${m.name}” from the cloud?`,
      `<p>Turn ${m.turn}, last played ${esc(whenText(m.savedAt, Date.now()))} on ${esc(m.device)}. This can’t be undone.</p>${
        here ? '<p class="sub">It’s the game on this device too: that copy stays here, and stops syncing.</p>' : ''
      }`,
      [
        { label: 'Cancel' },
        {
          label: 'Delete',
          cls: 'danger',
          run: () => {
            if (!this.sync) return;
            this.sync.store.remove(slot).then(
              () => {
                if (here) {
                  this.link = { gameId: this.link.gameId, syncedRev: 0, dirty: true, localOnly: true };
                  this.host.saveLocal();
                  this.setStatus('localOnly');
                }
                this.host.toast(`Deleted “${m.name}” from the cloud`);
                void this.refreshSlots();
              },
              () => this.host.toast('Couldn’t reach the cloud to delete it. Try again.', true),
            );
          },
        },
      ],
    );
  }

  /** Settings' Cloud saves row. */
  settingsRow(): { sub: string; control: string } {
    if (this.user) {
      return {
        sub: `Signed in as ${esc(this.user.name)} · ${esc(STATUS_TEXT[this.status])}`,
        control: '<button type="button" data-cloud="signOut">Sign out</button>',
      };
    }
    if (this.status === 'unavailable') return { sub: esc(STATUS_TEXT.unavailable), control: '' };
    // Round 16b: how the last try on this device ended (it's how an iPad sign-in gets diagnosed).
    const last = this.prefs().lastSignIn;
    const tried = last && last.result !== 'done'
      ? ` Last try: ${esc(whenText(last.at, Date.now()))}, ${last.how}, ${SIGN_IN_RESULT_TEXT[last.result]}${last.code ? ` (${esc(last.code)})` : ''}.`
      : '';
    return {
      sub: `<b>Not signed in.</b> Optional: play the same game on your other devices. Without it, your game is saved on this device as always.${tried}`,
      control: this.signingIn ? '<button type="button" data-cloud="signIn" disabled>Signing in…</button>' : '<button type="button" data-cloud="signIn">Sign in with Google</button>',
    };
  }
}
