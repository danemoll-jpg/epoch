// Round 14: a small binary min-heap of numbers (tile indices), for the path searches. Entries
// come out by priority, then by `tie` (lowest first), so a search is as deterministic as the
// order it pushes in.

export class MinHeap {
  private pri: number[] = [];
  private tie: number[] = [];
  private val: number[] = [];

  get size(): number {
    return this.val.length;
  }

  private less(i: number, j: number): boolean {
    const a = this.pri[i]!;
    const b = this.pri[j]!;
    return a < b || (a === b && this.tie[i]! < this.tie[j]!);
  }

  private swap(i: number, j: number): void {
    const p = this.pri[i]!;
    this.pri[i] = this.pri[j]!;
    this.pri[j] = p;
    const t = this.tie[i]!;
    this.tie[i] = this.tie[j]!;
    this.tie[j] = t;
    const v = this.val[i]!;
    this.val[i] = this.val[j]!;
    this.val[j] = v;
  }

  push(priority: number, tie: number, value: number): void {
    this.pri.push(priority);
    this.tie.push(tie);
    this.val.push(value);
    let i = this.val.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  /** The lowest entry's value (the heap must not be empty). */
  pop(): number {
    const top = this.val[0]!;
    const last = this.val.length - 1;
    this.swap(0, last);
    this.pri.pop();
    this.tie.pop();
    this.val.pop();
    const n = this.val.length;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }
}
