// Round 22 (item 5): players read "nation", never "civ" (short for the franchise name the IP
// rules keep out of the game) or "civilization". This scans every string literal in the code
// that ships (src/ outside src/dev/) and index.html for the word; code identifiers (civId,
// civs.ts, data-civ, …) aren't strings players see and are skipped.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** "civ", "Civ", "civs", "civ's", "civilization(s)" as a word, not part of an identifier, path, key or attribute. */
const WORD = /(?<![-./:\w$])[Cc]iv(?:s|ilizations?)?(?:['’]s?)?(?![\w$-]|\s*[:=(]|\.ts)/;

const BACKSLASH = String.fromCharCode(92);
const NEWLINE = String.fromCharCode(10);

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (p.split(/[/\\]/).slice(-2).join('/') === 'src/dev') continue;
      out.push(...files(p));
    } else if (/\.(ts|html)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/**
 * Every string literal in a TS source: quoted strings, and each run of template text (the
 * ${…} code inside is scanned as code, so nested templates are found too). Comments and regex
 * literals are skipped well enough for this check.
 */
function literals(src: string): string[] {
  const out: string[] = [];
  // What we're inside: code (with its brace depth, to find the end of a ${…}) or a template.
  const stack: { kind: 'code' | 'tpl'; depth: number }[] = [{ kind: 'code', depth: 0 }];
  let i = 0;
  let buf = '';
  const n = src.length;
  while (i < n) {
    const top = stack[stack.length - 1]!;
    const c = src[i]!;
    if (top.kind === 'tpl') {
      if (c === BACKSLASH) {
        buf += src[i + 1] ?? '';
        i += 2;
      } else if (c === '`') {
        out.push(buf);
        buf = '';
        stack.pop();
        i++;
      } else if (c === '$' && src[i + 1] === '{') {
        out.push(buf);
        buf = '';
        stack.push({ kind: 'code', depth: 0 });
        i += 2;
      } else {
        buf += c;
        i++;
      }
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== NEWLINE) i++;
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      let lit = '';
      while (j < n && src[j] !== c && src[j] !== NEWLINE) {
        if (src[j] === BACKSLASH) {
          lit += src[j + 1] ?? '';
          j += 2;
        } else lit += src[j++];
      }
      out.push(lit);
      i = j + 1;
    } else if (c === '`') {
      stack.push({ kind: 'tpl', depth: 0 });
      i++;
    } else if (c === '{') {
      top.depth++;
      i++;
    } else if (c === '}') {
      if (top.depth === 0 && stack.length > 1) stack.pop();
      else top.depth--;
      i++;
    } else if (c === '/' && /[=(,:;!&|?{}[]\s*$/.test(src.slice(Math.max(0, i - 20), i).split(NEWLINE).pop()!.length ? src.slice(Math.max(0, i - 20), i) : '(')) {
      // A regex literal: skip to its closing slash.
      let j = i + 1;
      let cls = false;
      while (j < n && src[j] !== NEWLINE) {
        if (src[j] === BACKSLASH) j++;
        else if (src[j] === '[') cls = true;
        else if (src[j] === ']') cls = false;
        else if (src[j] === '/' && !cls) break;
        j++;
      }
      i = j + 1;
    } else i++;
  }
  return out;
}

/** The text a player could see in a literal: HTML tags (attributes, classes) removed. */
function visibleText(lit: string): string {
  // Tooltips and screen-reader labels are read too.
  const attrs = [...lit.matchAll(/(?:title|aria-label|placeholder|alt)="([^"]*)"/g)].map((m) => m[1]).join(' ');
  return `${lit.replace(/<[^>]*>/g, ' ')} ${attrs}`;
}

describe('Round 22 item 5: "nation", not "civ", in what players read', () => {
  const root = join(__dirname, '..');
  const sources = [...files(join(root, 'src')), join(root, 'index.html')];

  it('no shipped string says "civ" or "civilization"', () => {
    const hits: string[] = [];
    for (const f of sources) {
      const text = readFileSync(f, 'utf8');
      const strings = f.endsWith('.html') ? [text] : literals(text);
      for (const s of strings) {
        const visible = visibleText(s);
        if (WORD.test(visible)) hits.push(`${f.slice(root.length + 1)}: ${visible.trim().slice(0, 140)}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('the scanner catches the word and skips identifiers', () => {
    for (const bad of ['Met 2 of 4 civs', 'Random civ', 'another civ’s borders', 'The first civ to', 'An unknown civilization', 'Civ']) expect(WORD.test(bad), bad).toBe(true);
    for (const ok of ['civId', 'data-civ', 'civRow', './civs', 'civs.ts', 'leader:civ', 'civic', 'Nation: Ukraine']) expect(WORD.test(ok), ok).toBe(false);
  });

  it('the literal scanner finds text inside nested templates, and skips comments', () => {
    const src = "// a civ comment\nconst a = `x ${b ? `the civ` : 'y'} z`; /* civ */ const r = /civ/;";
    expect(literals(src)).toContain('the civ');
    expect(literals(src).some((l) => l.includes('comment'))).toBe(false);
  });
});
