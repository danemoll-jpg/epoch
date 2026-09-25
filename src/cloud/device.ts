// Round 16: which kind of device wrote a save ("iPad", "PC"), from the user agent, shown on the
// main menu and in the keep-which prompt. iPadOS Safari says "Macintosh", so a Mac with a touch
// screen is an iPad (no Mac has one).

export function deviceLabel(ua: string, maxTouchPoints: number): string {
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return 'iPad';
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/CrOS/.test(ua)) return 'Chromebook';
  if (/Windows|Linux|X11/.test(ua)) return 'PC';
  return 'Browser';
}

/** Is the game running from a Home Screen icon (no browser around it)? */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
}
