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
  /** Drawn on from start to end when it appears; the number staggers members one after another. */
  readonly draw?: number;
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

/** The text's box around its anchor, before any rotation, in px. */
export const textBox = (
  text: string,
  size: number,
  align: TextAlign,
  baseline: TextBaseline
): { x0: number; x1: number; y0: number; y1: number } => {
  const w = textWidth(text, size);
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
  const box = textBox(item.text, item.size ?? fontSize, item.align, item.baseline);
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
}

export interface ResolvedText {
  readonly group: string;
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly tone: Tone;
  readonly anchor: TextAlign;
  readonly transform?: string;
  readonly italic?: boolean;
  readonly weight?: number;
  readonly size?: number;
}

export interface ResolvedCircle {
  readonly group: string;
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
}

/**
 * Which labels to draw. By priority, a label is kept unless it would overlap one already kept,
 * cross a member, or leave the viewport - so the figure never shows two numbers on top of each
 * other or a number struck through by the structure.
 */
export const placeLabels = (
  items: readonly SceneItem[],
  t: Transform,
  options: ResolveOptions
): Map<SceneText, SceneText> => {
  const obstacles: [[number, number], [number, number], number][] = [];
  for (const item of items) {
    if (item.kind !== 'path' || !item.obstacle) continue;
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
          obstacles.push([last, q, pad]);
          last = q;
        }
      } else if (prev && seg.op !== 'M') obstacles.push([prev, p, pad]);
      prev = p;
    }
  }
  const texts = items.flatMap((item, i) => (item.kind === 'text' ? [{ item, i }] : []));
  texts.sort((a, b) => b.item.priority - a.item.priority || a.i - b.i);
  const kept: Bounds[] = [];
  const result = new Map<SceneText, SceneText>();
  const vp = options.viewport;
  const fits = (item: SceneText): Bounds | null => {
    const box = textBounds(item, t, options.fontSize);
    if (vp && (box.minX < 0 || box.minY < 0 || box.maxX > vp.width || box.maxY > vp.height)) return null;
    if (kept.some((k) => overlaps(k, box, 1))) return null;
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
    const own = textBox(item.text, item.size ?? options.fontSize, item.align, item.baseline);
    const hit = obstacles.some(([p, q, pad]) =>
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
    for (const variant of [item, ...(item.alternatives ?? []).map((alt) => ({ ...item, ...alt }))]) {
      const box = fits(variant);
      if (!box) continue;
      kept.push(box);
      result.set(item, variant);
      break;
    }
  }
  return result;
};

/** Screen geometry for the scene, with the labels `placeLabels` keeps. */
export const resolveScene = (items: readonly SceneItem[], t: Transform, options: ResolveOptions): ResolvedScene => {
  const keep = placeLabels(items, t, options);
  const paths: ResolvedPath[] = [];
  const circles: ResolvedCircle[] = [];
  const texts: ResolvedText[] = [];

  for (const item of items) {
    if (item.kind === 'path') {
      paths.push({
        group: item.group,
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
      });
    } else if (item.kind === 'circle') {
      const [cx, cy] = project(t, item.at);
      circles.push({
        group: item.group,
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
        x: Math.round(x * 100) / 100,
        y: Math.round((y + BASELINE_SHIFT[placed.baseline] * (placed.size ?? options.fontSize)) * 100) / 100,
        text: placed.text,
        size: placed.size,
        tone: item.tone,
        anchor: placed.align,
        transform: rotate !== 0 ? `rotate(${n(rotate)} ${n(x)} ${n(y)})` : undefined,
        italic: item.italic,
        weight: item.weight,
      });
    }
  }

  return { paths: paths.sort((a, b) => a.layer - b.layer), circles, texts };
};
