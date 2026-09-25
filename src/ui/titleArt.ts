// Round 14 (B4): the main menu's background picture, if Dan has made one. Drop
// title-background.jpg (or .webp / .png) in src/assets/title/, and optionally a tall
// title-background-portrait.* for iPads held upright; docs/TITLE-ART.md has the spec. Without
// one, the menu keeps its dark gradient. The wordmark is always text, never in the picture.

const FILES: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../assets/title/title-background*.{jpg,jpeg,webp,png}', { query: '?url', import: 'default', eager: true })).map(([path, url]) => [
    path.replace(/^.*\//, '').replace(/\.[a-z]+$/, ''),
    url,
  ]),
);

/** The picture for this screen shape (portrait prefers the tall one), or undefined. */
export function titleBackground(portrait: boolean): string | undefined {
  return (portrait ? FILES['title-background-portrait'] : undefined) ?? FILES['title-background'] ?? FILES['title-background-portrait'];
}
