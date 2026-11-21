/**
 * A drawing as data. Every point is a model position (m) plus an offset in screen pixels, so
 * symbols, arrows, diagram ordinates and text keep their size whatever the model's scale, and the
 * fit can reserve exactly the room they need. Pure: no Vue, no DOM.
 */

/** A model point (x right, z down, m) moved by (dx, dy) screen pixels. */
export interface Anchor {
  readonly x: number;
  readonly z: number;
  readonly dx: number;
  readonly dy: number;
}

export type Tone =
  | 'ink'
  | 'muted'
  | 'brand'
  | 'normal'
  | 'shear'
  | 'moment'
  | 'deformed'
  | 'load'
  | 'reaction'
  | 'tension'
  | 'compression';

export type Segment =
  | { readonly op: 'M' | 'L'; readonly p: Anchor }
  | { readonly op: 'C'; readonly c1: Anchor; readonly c2: Anchor; readonly p: Anchor }
  /** A circular arc of radius r px around `center`, to p. */
  | {
      readonly op: 'A';
      readonly r: number;
      readonly large: boolean;
      /** Clockwise on screen. */
      readonly clockwise: boolean;
      readonly center: Anchor;
      readonly p: Anchor;
    }
  | { readonly op: 'Z' };

/** Paint order, back to front. */
export const LAYERS = {
  diagramFill: 0,
  diagramHatch: 1,
  diagramLine: 2,
  deformed: 3,
  member: 4,
  hinge: 5,
  support: 6,
  load: 7,
  reaction: 8,
  label: 9,
} as const;

export type LayerIndex = (typeof LAYERS)[keyof typeof LAYERS];

/** What every item carries: the caller's layer it belongs to, which switches it on and off. */
interface SceneBase {
  readonly group: string;
  /**
   * What the item draws, for a caller that marks it on hover or selection: `member:<id>`,
   * `node:<id>`, or a load's own `source`. Items of nothing in particular (dimensions) have none.
   */
  readonly entity?: string;
  /**
   * Drawn only when this label is: a mark that points at a value (a maximum's ordinate, the largest
   * displacement's dot) goes with the value when there is no room for it, rather than point at nothing.
   */
  readonly requires?: SceneText;
}

export interface ScenePath extends SceneBase {
  readonly kind: 'path';
  readonly layer: LayerIndex;
  readonly segments: readonly Segment[];
  readonly tone: Tone;
  /** Stroke width in px; 0 for none. */
  readonly width: number;
  readonly fill?: 'tone' | 'paper';
  readonly fillOpacity?: number;
  readonly opacity?: number;
  readonly dash?: string;
  /** Kept out of the fit: lines that stay inside something already fitted. */
  readonly fitIgnore?: boolean;
  readonly cap?: 'round' | 'butt';
  /** A label may not cover this line (the members). */
  readonly obstacle?: boolean;
  /**
   * Only the labels of other, always-on layers (loads, reactions) may not cover this line: a
   * diagram's outline, which its own numbers sit against.
   */
  readonly shield?: boolean;
  /**
   * Labels of these groups may not cover this line, wherever else they may go, diagrams crossed or
   * not: a member's name keeps off its loads' arrows. Everything else may cover it.
   */
  readonly keptOffBy?: readonly string[];
  /** Drawn on from start to end when it appears; the number staggers members one after another. */
  readonly draw?: number;
  /**
   * Not drawn: the area a caller hit-tests the item it belongs to by (a distributed load's band,
   * mostly empty between its arrows). Never an obstacle, never fitted.
   */
  readonly hitArea?: boolean;
}

export type TextAlign = 'start' | 'middle' | 'end';
export type TextBaseline = 'top' | 'middle' | 'bottom';

/** Where a label sits: the point it hangs from and how it is aligned there. */
export interface TextPlacement {
  readonly at: Anchor;
  readonly align: TextAlign;
  readonly baseline: TextBaseline;
  /** A shorter wording (a value without its unit) for a tight spot. */
  readonly text?: string;
  /** A smaller font, px, for a tight spot. */
  readonly size?: number;
  /** Clockwise turn, degrees. */
  readonly rotate?: number;
  /**
   * The spot may cross another diagram's outline, the label's halo keeping it readable: beside a
   * value at the same point, which is where a reader looks for it, rather than further away.
   */
  readonly acrossDiagrams?: boolean;
}

export interface SceneText extends SceneBase {
  readonly kind: 'text';
  readonly layer: LayerIndex;
  readonly at: Anchor;
  readonly text: string;
  readonly tone: Tone;
  readonly align: TextAlign;
  readonly baseline: TextBaseline;
  /** Higher wins when two labels would overlap; the other is left out. */
  readonly priority: number;
  /** Clockwise turn, degrees. */
  readonly rotate?: number;
  readonly italic?: boolean;
  readonly weight?: number;
  /** Font size, px; the plot's own when left out. */
  readonly size?: number;
  /** Written after `text`, smaller and lower: the x of A_x. */
  readonly sub?: string;
  /** The place may cross another diagram's outline (see TextPlacement). */
  readonly acrossDiagrams?: boolean;
  /** Other places to try, in order, when the first is taken. */
  readonly alternatives?: readonly TextPlacement[];
}

export interface SceneCircle extends SceneBase {
  readonly kind: 'circle';
  readonly layer: LayerIndex;
  readonly at: Anchor;
  readonly r: number;
  readonly tone: Tone;
  readonly width: number;
  readonly fill: 'paper' | 'tone';
}

export type SceneItem = ScenePath | SceneText | SceneCircle;

export const anchor = (x: number, z: number, dx = 0, dy = 0): Anchor => ({ x, z, dx, dy });

export const shift = (a: Anchor, dx: number, dy: number): Anchor => ({ ...a, dx: a.dx + dx, dy: a.dy + dy });

/** Screen transform: px = tx + s·x + dx, py = ty + s·z + dy. */
export interface Transform {
  readonly s: number;
  readonly tx: number;
  readonly ty: number;
}

export const project = (t: Transform, a: Anchor): [number, number] => [
  t.tx + t.s * a.x + a.dx,
  t.ty + t.s * a.z + a.dy,
];

/**
 * Advance widths of a typical UI sans, in em. SSR has no text metrics, and a slight overestimate
 * only costs a few pixels of margin.
 */
const charWidth = (ch: string): number => {
  if (/[0-9]/.test(ch)) return 0.56;
  if (/[.,:;·'|!il]/.test(ch)) return 0.28;
  if (ch === ' ' || ch === ' ') return 0.25;
  if (/[mwMWΔ]/.test(ch)) return 0.84;
  if (/[A-Z]/.test(ch)) return 0.66;
  return 0.56;
};

export const textWidth = (text: string, size: number): number =>
  [...text].reduce((w, ch) => w + charWidth(ch), 0) * size;

/** A superscript's size, and how far it rises above the baseline, as shares of its text's size */
export const SUP_SCALE = 0.75;
export const SUP_RISE = 0.38;

const SUPERSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁻': '−',
  '⁺': '+',
};

/** A piece of a label: written on the line, or raised as a superscript and smaller */
export interface TextRun {
  readonly text: string;
  /** The size it is written at, px, where it is not the label's own */
  readonly size?: number;
  /** How far it moves the baseline, px: up into a superscript, back down after it */
  readonly dy?: number;
}

/**
 * A label's text in runs, its superscript characters (a power of ten, `1.71·10⁻³`) as a real
 * superscript: plain digits, smaller and raised, rather than the font's tiny superscript glyphs.
 */
export const textRuns = (text: string, size: number): TextRun[] => {
  const runs: TextRun[] = [];
  let up = false;
  for (const ch of text) {
    const sup = SUPERSCRIPT_DIGITS[ch];
    const raised = sup !== undefined;
    const last = runs[runs.length - 1];
    if (last && raised === up) {
      runs[runs.length - 1] = { ...last, text: last.text + (sup ?? ch) };
      continue;
    }
    const rise = round2(size * SUP_RISE);
    runs.push(
      raised
        ? { text: sup, size: round2(size * SUP_SCALE), dy: -rise }
        : { text: ch, ...(runs.length > 0 ? { dy: rise } : {}) }
    );
    up = raised;
  }
  return runs;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

/** A subscript's size, as a share of its text's */
export const SUB_SCALE = 0.75;
/** How far a subscript drops below the baseline, as a share of its text's size */
export const SUB_DROP = 0.28;

/** The text's box around its anchor, before any rotation, in px. */
export const textBox = (
  text: string,
  size: number,
  align: TextAlign,
  baseline: TextBaseline,
  sub?: string
): { x0: number; x1: number; y0: number; y1: number } => {
  const w = textWidth(text, size) + (sub ? textWidth(sub, size * SUB_SCALE) : 0);
  const x0 = align === 'start' ? 0 : align === 'end' ? -w : -w / 2;
  const h = size;
  const y0 = baseline === 'top' ? 0 : baseline === 'bottom' ? -h : -h / 2;
  return { x0, x1: x0 + w, y0, y1: y0 + h };
};

/** Where the baseline goes for each vertical alignment, as a share of the font size. */
export const BASELINE_SHIFT: Record<TextBaseline, number> = { top: 0.78, middle: 0.35, bottom: -0.22 };

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const emptyBounds = (): Bounds => ({ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

const grow = (b: Bounds, x: number, y: number) => {
  if (x < b.minX) b.minX = x;
  if (x > b.maxX) b.maxX = x;
  if (y < b.minY) b.minY = y;
  if (y > b.maxY) b.maxY = y;
};

/** The screen box of a text item at transform t, rotation included. */
export const textBounds = (item: SceneText, t: Transform, fontSize: number): Bounds => {
  const [px, py] = project(t, item.at);
  const box = textBox(item.text, item.size ?? fontSize, item.align, item.baseline, item.sub);
  const b = emptyBounds();
  const r = ((item.rotate ?? 0) * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  for (const [x, y] of [
    [box.x0, box.y0],
    [box.x1, box.y0],
    [box.x0, box.y1],
    [box.x1, box.y1],
  ]) {
    grow(b, px + x * c - y * s, py + x * s + y * c);
  }
  return b;
};

/** Everything the scene paints, at scale s with no translation. */
export const sceneBounds = (items: readonly SceneItem[], s: number, fontSize: number): Bounds => {
  const t: Transform = { s, tx: 0, ty: 0 };
  const b = emptyBounds();
  const add = (a: Anchor, pad = 0) => {
    const [x, y] = project(t, a);
    grow(b, x - pad, y - pad);
    grow(b, x + pad, y + pad);
  };
  for (const item of items) {
    if (item.kind === 'path') {
      if (item.fitIgnore) continue;
      const pad = item.width / 2;
      for (const seg of item.segments) {
        if (seg.op === 'Z') continue;
        if (seg.op === 'C') {
          add(seg.c1, pad);
          add(seg.c2, pad);
        }
        // An arc is kept inside its circle, which is enough room for a symbol this small.
        if (seg.op === 'A') add(seg.center, seg.r + pad);
        add(seg.p, pad);
      }
    } else if (item.kind === 'circle') {
      add(item.at, item.r + item.width / 2);
    } else {
      const tb = textBounds(item, t, fontSize);
      grow(b, tb.minX, tb.minY);
      grow(b, tb.maxX, tb.maxY);
    }
  }
  return b;
};

export interface FitBox {
  /** Available width, px. */
  readonly width: number;
  /** Fixed height, px; leave out to size the height to the content. */
  readonly height?: number;
  /** Upper bound for an automatic height. */
  readonly maxHeight?: number;
  readonly padding: number;
  readonly fontSize: number;
}

export interface Fit extends Transform {
  readonly width: number;
  readonly height: number;
}

/**
 * The largest scale at which everything fits the box, centred in it. Width and height grow with
 * the scale like the maximum of linear functions, so the feasible scales are an interval from zero
 * and bisection finds its end.
 */
export const fitScene = (items: readonly SceneItem[], box: FitBox): Fit => {
  const innerW = Math.max(1, box.width - 2 * box.padding);
  const innerH = box.height !== undefined ? Math.max(1, box.height - 2 * box.padding) : undefined;
  const maxH = box.maxHeight !== undefined ? Math.max(1, box.maxHeight - 2 * box.padding) : Infinity;
  const limitH = innerH ?? maxH;

  const fits = (s: number): boolean => {
    const b = sceneBounds(items, s, box.fontSize);
    return b.maxX - b.minX <= innerW && b.maxY - b.minY <= limitH;
  };

  let lo = 0;
  let hi = 1;
  while (fits(hi) && hi < 1e9) {
    lo = hi;
    hi *= 2;
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  // Nothing fits even with the model shrunk to a point: draw it at a token scale rather than not at all.
  const s = lo > 0 ? lo : hi * 1e-3;

  const b = sceneBounds(items, s, box.fontSize);
  const contentW = b.maxX - b.minX;
  const contentH = b.maxY - b.minY;
  const height = box.height ?? Math.min(contentH, maxH) + 2 * box.padding;
  return {
    s,
    tx: box.padding + (innerW - contentW) / 2 - b.minX,
    ty: (height - contentH) / 2 - b.minY,
    width: box.width,
    height: Math.ceil(height),
  };
};

/* ── Resolving to SVG ─────────────────────────────────────────────────────────────────────────── */

export interface ResolvedPath {
  readonly group: string;
  readonly entity?: string;
  readonly d: string;
  readonly layer: LayerIndex;
  readonly tone: Tone;
  readonly width: number;
  readonly fill?: 'tone' | 'paper';
  readonly fillOpacity?: number;
  readonly opacity?: number;
  readonly dash?: string;
  readonly cap?: 'round' | 'butt';
  readonly draw?: number;
  /** Not to be drawn: an area to hit-test by (see ScenePath) */
  readonly hitArea?: boolean;
}

export interface ResolvedText {
  readonly group: string;
  readonly entity?: string;
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly tone: Tone;
  readonly anchor: TextAlign;
  readonly transform?: string;
  readonly italic?: boolean;
  readonly weight?: number;
  readonly size?: number;
  readonly sub?: string;
}

export interface ResolvedCircle {
  readonly group: string;
  readonly entity?: string;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly layer: LayerIndex;
  readonly tone: Tone;
  readonly width: number;
  readonly fill: 'paper' | 'tone';
}

export interface ResolvedScene {
  readonly paths: readonly ResolvedPath[];
  readonly circles: readonly ResolvedCircle[];
  readonly texts: readonly ResolvedText[];
  /**
   * What is painted, px at the transform's scale with no translation: the labels where they were
   * placed (left-out ones not at all), without the fit-ignored hatching and hit areas.
   */
  readonly bounds: Bounds;
}

const n = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

export const pathData = (segments: readonly Segment[], t: Transform): string =>
  segments
    .map((seg) => {
      switch (seg.op) {
        case 'Z':
          return 'Z';
        case 'M':
        case 'L': {
          const [x, y] = project(t, seg.p);
          return `${seg.op}${n(x)} ${n(y)}`;
        }
        case 'A': {
          const [x, y] = project(t, seg.p);
          return `A${n(seg.r)} ${n(seg.r)} 0 ${seg.large ? 1 : 0} ${seg.clockwise ? 1 : 0} ${n(x)} ${n(y)}`;
        }
        case 'C': {
          const [x1, y1] = project(t, seg.c1);
          const [x2, y2] = project(t, seg.c2);
          const [x, y] = project(t, seg.p);
          return `C${n(x1)} ${n(y1)} ${n(x2)} ${n(y2)} ${n(x)} ${n(y)}`;
        }
      }
    })
    .join('');

const overlaps = (a: Bounds, b: Bounds, margin: number): boolean =>
  a.minX < b.maxX + margin && b.minX < a.maxX + margin && a.minY < b.maxY + margin && b.minY < a.maxY + margin;

/** How much of two boxes lies in both, px² */
const overlapArea = (a: Bounds, b: Bounds): number =>
  Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) *
  Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));

/** Whether the segment p–q passes through the box (Liang-Barsky clipping). */
export const segmentHitsBox = (p: readonly [number, number], q: readonly [number, number], box: Bounds): boolean => {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, p[0] - box.minX],
    [dx, box.maxX - p[0]],
    [-dy, p[1] - box.minY],
    [dy, box.maxY - p[1]],
  ];
  for (const [pk, qk] of edges) {
    if (pk === 0) {
      if (qk < 0) return false;
    } else {
      const r = qk / pk;
      if (pk < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
};

export interface ResolveOptions {
  readonly fontSize: number;
  /** Labels must lie inside this box, px; ones that do not are left out. */
  readonly viewport?: { readonly width: number; readonly height: number };
  /** Labels that must be left out whatever room there is. */
  readonly exclude?: ReadonlySet<SceneText>;
  /**
   * Groups that are never shown together (one result diagram at a time): their labels are placed
   * after everything else and give way to it, but not to each other, so a hidden diagram's numbers
   * never push out a load's value or the numbers of the diagram on show.
   */
  readonly alternativeGroups?: ReadonlySet<string>;
  /**
   * The groups whose `shield` lines count (the diagrams on show); all of them when left out. A
   * hidden diagram does not keep a load's value off the place it would take.
   */
  readonly shields?: ReadonlySet<string>;
  /**
   * Groups placed after every other label: the results, read off the structure. The others (loads,
   * reactions, names) are what the reader was given, so they go first. With it, a label that finds
   * no place clear of another diagram's outline may cross it, its halo keeping it readable, rather
   * than be left out. Without it, every group is placed by priority alone.
   */
  readonly lateGroups?: ReadonlySet<string>;
  /**
   * Groups that give way to every other label: their labels are placed last, and their lines keep
   * no other group's label off (an editor's loads, whose values stand outside their bands while the
   * internal forces' values may lie over a band's side).
   */
  readonly yieldingGroups?: ReadonlySet<string>;
  /**
   * Groups placed after every other, the yielding ones too: labels that matter least (a member's
   * name), which find room round everything else or give way, rather than take a place a label that
   * is never left out then has to cover.
   */
  readonly lastGroups?: ReadonlySet<string>;
  /**
   * Groups whose labels are never left out: with no free place, at the place that covers the least
   * of the labels already kept (its first place among equals).
   */
  readonly keptGroups?: ReadonlySet<string>;
}

/**
 * Which labels to draw. By priority, a label is kept unless it would overlap one already kept,
 * cross a member, or leave the viewport - so the figure never shows two numbers on top of each
 * other or a number struck through by the structure.
 */
/**
 * A uniform grid over the screen: each entry is listed in every cell its box touches, so a query
 * returns what lies near a box without looking at everything else. Placing a label then costs
 * about the same whatever the size of the model.
 */
class Grid<T> {
  private readonly cells = new Map<number, T[]>();
  /** Every entry, for a query too large to go cell by cell */
  private readonly all: T[] = [];
  /**
   * Entries too large to list cell by cell: a member drawn at an extreme zoom (a fit's first probe)
   * spans millions of px, and listing it in every cell it crosses ran out of memory.
   */
  private readonly large: T[] = [];
  constructor(private readonly size: number) {}
  private key(i: number, j: number): number {
    // Cell indices well inside ±2^20 for any screen: packed into one safe integer. Beyond, keys may
    // coincide, which only offers a caller more candidates to check
    return (i + 1048576) * 2097152 + (j + 1048576);
  }
  /** The cells a box covers, or null when they are too many to visit one by one */
  private span(b: Bounds): [number, number, number, number] | null {
    const i0 = Math.floor(b.minX / this.size);
    const i1 = Math.floor(b.maxX / this.size);
    const j0 = Math.floor(b.minY / this.size);
    const j1 = Math.floor(b.maxY / this.size);
    // Not finite counts as too many
    return (i1 - i0 + 1) * (j1 - j0 + 1) <= MAX_GRID_CELLS ? [i0, i1, j0, j1] : null;
  }
  add(b: Bounds, value: T): void {
    this.all.push(value);
    const span = this.span(b);
    if (!span) {
      this.large.push(value);
      return;
    }
    const [i0, i1, j0, j1] = span;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = this.key(i, j);
        const cell = this.cells.get(k);
        if (cell) cell.push(value);
        else this.cells.set(k, [value]);
      }
    }
  }
  /** Every entry whose cells meet the box, each once (`seen` marks them for this query). */
  near(b: Bounds, seen: Set<T>): T[] {
    seen.clear();
    const out: T[] = [];
    const take = (v: T) => {
      if (seen.has(v)) return;
      seen.add(v);
      out.push(v);
    };
    const span = this.span(b);
    if (!span) {
      this.all.forEach(take);
      return out;
    }
    this.large.forEach(take);
    const [i0, i1, j0, j1] = span;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        this.cells.get(this.key(i, j))?.forEach(take);
      }
    }
    return out;
  }
}

/** The most cells an entry or a query is listed in one by one */
const MAX_GRID_CELLS = 256;

/** Cell size of the label grid, px: about a label's length */
const GRID_PX = 48;

export const placeLabels = (
  items: readonly SceneItem[],
  t: Transform,
  options: ResolveOptions
): Map<SceneText, SceneText> => {
  /**
   * Segments labels keep off, px, with their padding, for a shield the group it belongs to, the
   * groups whose labels it keeps off whatever else holds (keptOffBy), and whether those are all it
   * keeps off - a line that is neither an obstacle nor a shield.
   */
  type Obstacle = [
    [number, number],
    [number, number],
    number,
    string | null,
    string,
    readonly string[] | undefined,
    boolean,
  ];
  const obstacles: Obstacle[] = [];
  for (const item of items) {
    if (
      item.kind !== 'path' ||
      !(item.obstacle || item.keptOffBy || (item.shield && (options.shields?.has(item.group) ?? true)))
    )
      continue;
    const owner = item.obstacle ? null : item.group;
    const only = item.keptOffBy;
    const onlyThose = !item.obstacle && !item.shield;
    const pad = item.width / 2 + 1;
    let prev: [number, number] | null = null;
    for (const seg of item.segments) {
      if (seg.op === 'Z') continue;
      const p = project(t, seg.p);
      if (seg.op === 'A' && prev) {
        // An arc, as a few chords.
        const [cx, cy] = project(t, seg.center);
        const a0 = Math.atan2(prev[1] - cy, prev[0] - cx);
        let a1 = Math.atan2(p[1] - cy, p[0] - cx);
        if (seg.clockwise && a1 < a0) a1 += 2 * Math.PI;
        if (!seg.clockwise && a1 > a0) a1 -= 2 * Math.PI;
        let last = prev;
        for (let i = 1; i <= 12; i++) {
          const a = a0 + ((a1 - a0) * i) / 12;
          const q: [number, number] = [cx + seg.r * Math.cos(a), cy + seg.r * Math.sin(a)];
          obstacles.push([last, q, pad, owner, item.group, only, onlyThose]);
          last = q;
        }
      } else if (seg.op === 'C' && prev) {
        // A cubic, as a few chords: its straight chord can be far from the curve (a whole member's
        // moment parabola is one cubic from tip to tip).
        const [c1, c2] = [project(t, seg.c1), project(t, seg.c2)];
        let last = prev;
        for (let i = 1; i <= 12; i++) {
          const u = i / 12;
          const v = 1 - u;
          const q: [number, number] = [
            v * v * v * prev[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * p[0],
            v * v * v * prev[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * p[1],
          ];
          obstacles.push([last, q, pad, owner, item.group, only, onlyThose]);
          last = q;
        }
      } else if (prev && seg.op !== 'M') obstacles.push([prev, p, pad, owner, item.group, only, onlyThose]);
      prev = p;
    }
  }
  const alternativeGroups = options.alternativeGroups ?? new Set<string>();
  const texts = items.flatMap((item, i) => (item.kind === 'text' ? [{ item, i }] : []));
  // The labels that are always on (loads, reactions) go first, so which result is on show never
  // changes them; each result's numbers then find room around them.
  const lateGroups = options.lateGroups;
  const yielding = options.yieldingGroups;
  const last = options.lastGroups;
  const late = (label: SceneText) =>
    last?.has(label.group)
      ? 4
      : yielding?.has(label.group)
        ? 3
        : alternativeGroups.has(label.group)
          ? 2
          : lateGroups?.has(label.group)
            ? 1
            : 0;
  // Among equal given data, the label with the fewest places goes first: one with a single place (a
  // load's value at its end) takes it before a label that could stand elsewhere (a nodal force's)
  // takes it from it - and is then kept on top of it, never being left out. Other labels keep their
  // order, so figures without such a clash are laid out as before.
  const places = (label: SceneText) =>
    options.keptGroups?.has(label.group) ? 1 + (label.alternatives?.length ?? 0) : 0;
  texts.sort(
    (a, b) =>
      late(a.item) - late(b.item) || b.item.priority - a.item.priority || places(a.item) - places(b.item) || a.i - b.i
  );
  // Both indexed by where they are, so a label is tested only against what lies near it
  type Kept = { box: Bounds; group: string };
  const kept = new Grid<Kept>(GRID_PX);
  const lines = new Grid<Obstacle>(GRID_PX);
  let maxPad = 0;
  for (const o of obstacles) {
    const [p, q, pad] = o;
    maxPad = Math.max(maxPad, pad);
    lines.add(
      {
        minX: Math.min(p[0], q[0]) - pad,
        maxX: Math.max(p[0], q[0]) + pad,
        minY: Math.min(p[1], q[1]) - pad,
        maxY: Math.max(p[1], q[1]) + pad,
      },
      o
    );
  }
  const seenKept = new Set<Kept>();
  const seenLines = new Set<Obstacle>();
  const result = new Map<SceneText, SceneText>();
  const vp = options.viewport;
  const competes = (a: string, b: string) => a === b || !alternativeGroups.has(a) || !alternativeGroups.has(b);
  const fits = (item: SceneText, acrossDiagrams = false): Bounds | null => {
    const box = textBounds(item, t, options.fontSize);
    if (vp && (box.minX < 0 || box.minY < 0 || box.maxX > vp.width || box.maxY > vp.height)) return null;
    const nearBox = { minX: box.minX - 1, maxX: box.maxX + 1, minY: box.minY - 1, maxY: box.maxY + 1 };
    if (kept.near(nearBox, seenKept).some((k) => competes(k.group, item.group) && overlaps(k.box, box, 1))) return null;
    // Against the lines, in the text's own frame so a label turned along a bar is tested as drawn;
    // a little inside its box, which the glyphs do not fill.
    const [ax, ay] = project(t, item.at);
    const r = (-(item.rotate ?? 0) * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const local = ([x, y]: [number, number]): [number, number] => [
      (x - ax) * c - (y - ay) * s,
      (x - ax) * s + (y - ay) * c,
    ];
    const own = textBox(item.text, item.size ?? options.fontSize, item.align, item.baseline, item.sub);
    const blocks = (owner: string | null, group: string, only: readonly string[] | undefined, onlyThose: boolean) =>
      // The labels a line keeps off whatever else holds (keptOffBy), a yielding group's included
      only?.includes(item.group) === true ||
      (!onlyThose &&
        // A yielding group's lines keep only its own labels off
        (!yielding?.has(group) || group === item.group) &&
        (owner === null || (!acrossDiagrams && owner !== item.group && !alternativeGroups.has(item.group))));
    const reach = {
      minX: box.minX - maxPad,
      maxX: box.maxX + maxPad,
      minY: box.minY - maxPad,
      maxY: box.maxY + maxPad,
    };
    const hit = lines.near(reach, seenLines).some(
      ([p, q, pad, owner, group, only, onlyThose]) =>
        blocks(owner, group, only, onlyThose) &&
        segmentHitsBox(local(p), local(q), {
          minX: own.x0 - pad + 1,
          maxX: own.x1 + pad - 1,
          minY: own.y0 - pad + 2,
          maxY: own.y1 + pad - 2,
        })
    );
    return hit ? null : box;
  };
  for (const { item } of texts) {
    if (options.exclude?.has(item)) continue;
    const variants = [item, ...(item.alternatives ?? []).map((alt) => ({ ...item, ...alt }))];
    // A label that found no place clear of the other diagrams may cross one, its halo keeping it
    // readable, rather than go missing: the given data first, then each result's values
    const retry = lateGroups !== undefined && !alternativeGroups.has(item.group);
    place: for (const acrossDiagrams of retry ? [false, true] : [false]) {
      for (const variant of variants) {
        const box = fits(variant, acrossDiagrams || variant.acrossDiagrams === true);
        if (!box) continue;
        kept.add(box, { box, group: item.group });
        result.set(item, variant);
        break place;
      }
    }
    // Given data is never left out: with no free place, at the place that covers the least of the
    // labels already kept - not its first by default, where it may sit right on another value
    if (!result.has(item) && options.keptGroups?.has(item.group)) {
      let best: { variant: SceneText; box: Bounds; covered: number } | null = null;
      for (const variant of variants) {
        const box = textBounds(variant, t, options.fontSize);
        if (vp && (box.minX < 0 || box.minY < 0 || box.maxX > vp.width || box.maxY > vp.height)) continue;
        const covered = kept
          .near(box, seenKept)
          .filter((k) => competes(k.group, item.group))
          .reduce((sum, k) => sum + overlapArea(k.box, box), 0);
        if (best === null || covered < best.covered) best = { variant, box, covered };
      }
      if (best) {
        kept.add(best.box, { box: best.box, group: item.group });
        result.set(item, best.variant);
      }
    }
  }
  return result;
};

/** Screen geometry for the scene, with the labels `placeLabels` keeps. */
/**
 * The resolved paths with every run that would paint alike - same layer, group, entity and style -
 * joined into one path: a band of thirty arrows becomes two paths (shafts, heads) instead of sixty.
 * Paint order is kept between layers and between different styles; within a layer, alike paths
 * gather where the first of them was. Paths that animate on (`draw`) are left alone.
 */
export const mergePaths = (paths: readonly ResolvedPath[]): ResolvedPath[] => {
  const out: ResolvedPath[] = [];
  const at = new Map<string, number>();
  let layer: number | null = null;
  for (const p of paths) {
    // Alike only within one layer, so a later layer still paints over an earlier one
    if (p.layer !== layer) {
      at.clear();
      layer = p.layer;
    }
    if (p.draw !== undefined) {
      out.push(p);
      continue;
    }
    const key = [
      p.group,
      p.entity ?? '',
      p.tone,
      p.width,
      p.fill ?? '',
      p.fillOpacity ?? '',
      p.opacity ?? '',
      p.dash ?? '',
      p.cap ?? '',
      p.hitArea ? 1 : 0,
    ].join('|');
    const i = at.get(key);
    if (i === undefined) {
      at.set(key, out.length);
      out.push(p);
    } else out[i] = { ...out[i], d: `${out[i].d}${p.d}` };
  }
  return out;
};

export const resolveScene = (items: readonly SceneItem[], t: Transform, options: ResolveOptions): ResolvedScene => {
  const keep = placeLabels(items, t, options);
  const paths: ResolvedPath[] = [];
  const circles: ResolvedCircle[] = [];
  const texts: ResolvedText[] = [];

  for (const item of items) {
    if (item.kind !== 'text' && item.requires && !keep.has(item.requires)) continue;
    if (item.kind === 'path') {
      paths.push({
        group: item.group,
        entity: item.entity,
        d: pathData(item.segments, t),
        layer: item.layer,
        tone: item.tone,
        width: item.width,
        fill: item.fill,
        fillOpacity: item.fillOpacity,
        opacity: item.opacity,
        dash: item.dash,
        cap: item.cap,
        draw: item.draw,
        hitArea: item.hitArea,
      });
    } else if (item.kind === 'circle') {
      const [cx, cy] = project(t, item.at);
      circles.push({
        group: item.group,
        entity: item.entity,
        cx,
        cy,
        r: item.r,
        layer: item.layer,
        tone: item.tone,
        width: item.width,
        fill: item.fill,
      });
    } else {
      const placed = keep.get(item);
      if (!placed) continue;
      const [x, y] = project(t, placed.at);
      const rotate = placed.rotate ?? 0;
      texts.push({
        group: item.group,
        entity: item.entity,
        x: Math.round(x * 100) / 100,
        y: Math.round((y + BASELINE_SHIFT[placed.baseline] * (placed.size ?? options.fontSize)) * 100) / 100,
        text: placed.text,
        sub: item.sub,
        size: placed.size,
        tone: item.tone,
        anchor: placed.align,
        transform: rotate !== 0 ? `rotate(${n(rotate)} ${n(x)} ${n(y)})` : undefined,
        italic: item.italic,
        weight: item.weight,
      });
    }
  }

  const painted = items.flatMap((item): SceneItem[] => {
    if (item.kind !== 'text') return [item];
    const placed = keep.get(item);
    return placed ? [placed] : [];
  });
  const bounds = sceneBounds(painted, t.s, options.fontSize);
  return { paths: paths.sort((a, b) => a.layer - b.layer), circles, texts, bounds };
};
