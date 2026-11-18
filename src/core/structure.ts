/**
 * The drawing of a whole structure as scene items, in the hand of the EduBeam website's figures
 * (HeroFigure, BuildSteps): ink members with round caps, outlined supports, orange loads, purple
 * reactions clear of the supports, diagrams as an outline with ordinates across the member, and
 * numbers only where a reader looks for them - extremes and corners.
 *
 * Sign rules follow the EduBeam app: N and V positive away from the member's local +z side, M on
 * the tension side, so a sagging moment hangs below a beam drawn left to right.
 */
import {
  memberFrame,
  nodeMap,
  pointAlong,
  type InternalForce,
  type MemberFrame,
  type MemberResults,
  type PlotLoad,
  type PlotMember,
  type PlotModel,
  type PlotNode,
  type PlotReaction,
} from './model';
import {
  evalPiece,
  evalPieceSlope,
  extremes,
  innerBreaks,
  maxAbs,
  pieceDegree,
  pieceExtrema,
  pieceToBeziers,
  valueAt,
  type Piece,
  type Piecewise,
} from './polynomial';
import {
  anchor,
  LAYERS,
  shift,
  type Anchor,
  type SceneItem,
  type ScenePath,
  type SceneText,
  type Segment,
  type TextAlign,
  type TextBaseline,
  type TextPlacement,
  type Tone,
} from './scene';
import { glyphReach, groundDirection, memberDirections, supportGlyph, supportPlacement } from './supports';
import { formatNumber, formatQuantity, type Unit, type Units } from './units';

/** What the caller switches on and off. Results are named by their symbol. */
export type PlotLayer =
  | 'nodes'
  | 'nodeLabels'
  | 'dimensions'
  | 'members'
  | 'supports'
  | 'loads'
  | 'reactions'
  | 'N'
  | 'V'
  | 'M'
  | 'w';

/** Every layer, in paint order: results under the structure, nodes on top as BuildSteps draws them. */
export const PLOT_LAYERS: readonly PlotLayer[] = [
  'N',
  'V',
  'M',
  'w',
  'dimensions',
  'members',
  'supports',
  'loads',
  'reactions',
  'nodes',
  'nodeLabels',
];

export const RESULT_LAYERS = ['N', 'V', 'M', 'w'] as const satisfies readonly PlotLayer[];
export type ResultLayer = (typeof RESULT_LAYERS)[number];

export interface StructureSceneOptions {
  /** Layers to build. Build every layer that may be shown, so the layout never moves. */
  readonly layers: ReadonlySet<PlotLayer>;
  /** Thumbnail drawing: smaller symbols, at most two values per member, magnitudes only. */
  readonly compact: boolean;
  readonly units: Units;
  readonly numberFormat?: Intl.NumberFormat;
  /** Current scale in px per metre: spaces ordinates and load arrows evenly on screen. */
  readonly scale: number;
  /** Largest diagram ordinate, px. */
  readonly diagramSize: number;
  /** Largest displacement on the deformed shape, px. */
  readonly deformedSize: number;
  /** Fixed px per SI unit for a result, to draw several plots at one scale. */
  readonly diagramScale?: Partial<Record<ResultLayer, number>>;
  /** M on the tension side (most of Europe); off draws it on the compression side. */
  readonly momentOnTensionSide: boolean;
  /** The plot's font size, px: labels in a tight spot may step down from it to 10 px. */
  readonly fontSize?: number;
  /** Values upright (`horizontal`) or turned to run along their ordinate (`axis`), as in the app. */
  readonly resultLabelMode?: ResultLabelMode;
}

export type ResultLabelMode = 'axis' | 'horizontal';

/** Ordinates are this far apart on screen, as in the app and the website's figures. */
export const HATCH_SPACING_PX = 7;

/** Symbol sizes in px: the website's figures, and a smaller set for thumbnails. */
const SIZES = {
  full: {
    member: 3.5,
    pointShaft: 3,
    pointHead: 12,
    pointHeadWidth: 14,
    pointArrow: 52,
    udlArrow: 32,
    udlSpacing: 18,
    reaction: 46,
    reactionGap: 11,
    arc: 15,
    reactionArc: 20,
    deformed: 2.25,
  },
  compact: {
    member: 2.75,
    pointShaft: 2.25,
    pointHead: 9,
    pointHeadWidth: 10,
    pointArrow: 34,
    udlArrow: 22,
    udlSpacing: 14,
    reaction: 32,
    reactionGap: 8,
    arc: 11,
    reactionArc: 15,
    deformed: 1.75,
  },
} as const;

type Sizes = (typeof SIZES)[keyof typeof SIZES];

const DIAGRAM_TONE: Record<InternalForce, Tone> = { N: 'normal', V: 'shear', M: 'moment' };

/* ── Vectors (screen and model share orientation: x right, y/z down) ────────────────────────── */

type Vec = { readonly x: number; readonly y: number };

const unit = (x: number, y: number): Vec => {
  const l = Math.hypot(x, y);
  return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
};

const at = (frame: MemberFrame, x: number, dx = 0, dy = 0): Anchor => {
  const p = pointAlong(frame, x);
  return anchor(p.x, p.z, dx, dy);
};

/** Text beside a point, on the side `dir` points to, aligned so it grows away from the point. */
const placeText = (base: Anchor, dir: Vec, gap: number): { at: Anchor; align: TextAlign; baseline: TextBaseline } => {
  const p = shift(base, dir.x * gap, dir.y * gap);
  // Sideways: centred on the line. Up or down: centred over the point. Diagonal: wholly in that
  // quadrant, so the text clears both the horizontal and the vertical through the point.
  if (Math.abs(dir.x) > 0.85) return { at: p, align: dir.x > 0 ? 'start' : 'end', baseline: 'middle' };
  return {
    at: p,
    align: Math.abs(dir.x) < 0.25 ? 'middle' : dir.x > 0 ? 'start' : 'end',
    baseline: dir.y > 0 ? 'top' : 'bottom',
  };
};

const text = (
  group: PlotLayer,
  base: Anchor,
  dir: Vec,
  gap: number,
  content: string,
  tone: Tone,
  priority: number
): SceneText => ({
  kind: 'text',
  group,
  layer: LAYERS.label,
  text: content,
  tone,
  priority,
  ...placeText(base, dir, gap),
});

/** A straight arrow from `tail` to `tip`, px offsets from one model point, with a solid head. */
const arrow = (
  group: PlotLayer,
  origin: Anchor,
  tail: Vec,
  tip: Vec,
  tone: Tone,
  layer: ScenePath['layer'],
  style: { width: number; head: number; headWidth: number; dash?: string; obstacle?: boolean }
): ScenePath[] => {
  const d = unit(tip.x - tail.x, tip.y - tail.y);
  const half = style.headWidth / 2;
  const base = { x: tip.x - d.x * style.head, y: tip.y - d.y * style.head };
  return [
    {
      kind: 'path',
      group,
      layer,
      tone,
      width: style.width,
      dash: style.dash,
      cap: 'butt',
      obstacle: style.obstacle,
      segments: [
        { op: 'M', p: shift(origin, tail.x, tail.y) },
        // Into the head a little, so no gap shows between shaft and head.
        { op: 'L', p: shift(origin, base.x + d.x, base.y + d.y) },
      ],
    },
    {
      kind: 'path',
      group,
      layer,
      tone,
      width: 0,
      fill: 'tone',
      segments: [
        { op: 'M', p: shift(origin, tip.x, tip.y) },
        { op: 'L', p: shift(origin, base.x - d.y * half, base.y + d.x * half) },
        { op: 'L', p: shift(origin, base.x + d.y * half, base.y - d.x * half) },
        { op: 'Z' },
      ],
    },
  ];
};

/**
 * A 270° arc around `origin` with an arrowhead, for a moment. The open quarter faces `gap`;
 * a positive moment turns counter-clockwise on screen.
 */
const momentArc = (
  group: PlotLayer,
  origin: Anchor,
  radius: number,
  counterClockwise: boolean,
  gap: Vec,
  tone: Tone,
  layer: ScenePath['layer'],
  dash?: string,
  sweep = 270
): ScenePath[] => {
  const g = Math.atan2(gap.y, gap.x);
  // Centred opposite the gap. Screen angles grow clockwise, so a counter-clockwise turn runs
  // from the larger angle back to the smaller.
  const centre = g + Math.PI;
  const half = ((sweep / 2) * Math.PI) / 180;
  const a0 = counterClockwise ? centre + half : centre - half;
  const a1 = counterClockwise ? centre - half : centre + half;
  const p = (a: number): Vec => ({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
  const start = p(a0);
  const end = p(a1);
  const tangent = counterClockwise ? { x: Math.sin(a1), y: -Math.cos(a1) } : { x: -Math.sin(a1), y: Math.cos(a1) };
  const head = 8;
  const headHalf = 3.5;
  const base = { x: end.x - tangent.x * head * 0.6, y: end.y - tangent.y * head * 0.6 };
  const tip = { x: base.x + tangent.x * head, y: base.y + tangent.y * head };
  return [
    {
      kind: 'path',
      group,
      layer,
      tone,
      width: 1.75,
      dash,
      cap: 'butt',
      obstacle: true,
      segments: [
        { op: 'M', p: shift(origin, start.x, start.y) },
        {
          op: 'A',
          r: radius,
          large: true,
          clockwise: !counterClockwise,
          center: origin,
          p: shift(origin, end.x, end.y),
        },
      ],
    },
    {
      kind: 'path',
      group,
      layer,
      tone,
      width: 0,
      fill: 'tone',
      segments: [
        { op: 'M', p: shift(origin, tip.x, tip.y) },
        { op: 'L', p: shift(origin, base.x - tangent.y * headHalf, base.y + tangent.x * headHalf) },
        { op: 'L', p: shift(origin, base.x + tangent.y * headHalf, base.y - tangent.x * headHalf) },
        { op: 'Z' },
      ],
    },
  ];
};

/** The eight compass directions, those farthest from every direction already in use first. */
const rankedDirections = (used: readonly Vec[], preferred: Vec): Vec[] =>
  Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4 - Math.PI / 4;
    const c = { x: Math.cos(a), y: Math.sin(a) };
    const clearance = Math.min(2, ...used.map((u) => 1 - (c.x * u.x + c.y * u.y)));
    return { c, score: clearance + 0.01 * (c.x * preferred.x + c.y * preferred.y) };
  })
    .sort((a, b) => b.score - a.score)
    .map(({ c }) => c);

/** Of the eight compass directions, the one farthest from every direction already in use. */
const freeDirection = (used: readonly Vec[], preferred: Vec): Vec => {
  let best = preferred;
  let bestScore = -Infinity;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 4;
    const c = { x: Math.cos(a), y: Math.sin(a) };
    const clearance = Math.min(2, ...used.map((u) => 1 - (c.x * u.x + c.y * u.y)));
    const score = clearance + 0.01 * (c.x * preferred.x + c.y * preferred.y);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
};

/** Unit vector from the node away from the members meeting it; `fallback` when they cancel. */
const awayFrom = (model: PlotModel, node: PlotNode, fallback: Vec): Vec => {
  const m = memberDirections(model, node);
  const l = Math.hypot(m.x, m.z);
  return l > 1e-9 ? { x: -m.x / l, y: -m.z / l } : fallback;
};

/** A member's frame, which `memberFrames` made for every member: a miss is a bug, so it throws. */
const frameOf = (frames: ReadonlyMap<string, MemberFrame>, id: string): MemberFrame => {
  const f = frames.get(id);
  if (!f) throw new Error(`No frame for member ${id}`);
  return f;
};

/* ── Structure: members, hinges, supports, nodes, dimensions ─────────────────────────────── */

const memberItems = (model: PlotModel, frames: ReadonlyMap<string, MemberFrame>, size: Sizes): SceneItem[] =>
  model.members.map((m, i): SceneItem => {
    const f = frameOf(frames, m.id);
    return {
      kind: 'path',
      group: 'members',
      layer: LAYERS.member,
      tone: 'ink',
      width: size.member,
      cap: 'round',
      obstacle: true,
      draw: i,
      segments: [
        { op: 'M', p: at(f, 0) },
        { op: 'L', p: at(f, f.length) },
      ],
    };
  });

/**
 * A joint where every member but at most one is released is a hinge in the node: one circle
 * there. Elsewhere a released end gets its own circle just inside its member.
 */
const hingeItems = (model: PlotModel, frames: ReadonlyMap<string, MemberFrame>, size: Sizes): SceneItem[] => {
  const items: SceneItem[] = [];
  const r = size.member + 1;
  for (const node of model.nodes) {
    const ends = model.members.flatMap((m): { m: PlotMember; end: 0 | 1 }[] =>
      m.start === node.id ? [{ m, end: 0 }] : m.end === node.id ? [{ m, end: 1 }] : []
    );
    const released = ends.filter(({ m, end }) => m.hinges[end]);
    if (released.length === 0) continue;
    const circle = (a: Anchor): SceneItem => ({
      kind: 'circle',
      group: 'members',
      layer: LAYERS.hinge,
      at: a,
      r,
      tone: 'ink',
      width: 1.75,
      fill: 'paper',
    });
    if (ends.length - released.length <= 1) {
      items.push(circle(anchor(node.x, node.z)));
      continue;
    }
    for (const { m, end } of released) {
      const f = frameOf(frames, m.id);
      const sign = end === 0 ? 1 : -1;
      const off = r * 2 + 1;
      items.push(circle(at(f, end === 0 ? 0 : f.length, sign * f.tx * off, sign * f.tz * off)));
    }
  }
  return items;
};

const supportItems = (model: PlotModel, connected: ReadonlySet<string>): SceneItem[] => {
  const items: SceneItem[] = [];
  for (const node of model.nodes) {
    if (!connected.has(node.id)) continue;
    const placement = supportPlacement(model, node);
    const r = (placement.rotation * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    for (const part of supportGlyph(placement.kind)) {
      const pts = part.points.map(([x, y]) => anchor(node.x, node.z, x * c - y * s, x * s + y * c));
      items.push({
        kind: 'path',
        group: 'supports',
        layer: LAYERS.support,
        tone: 'ink',
        width: part.weight === 'bold' ? 2.25 : part.weight === 'regular' ? 1.6 : 1,
        fill: part.fill,
        cap: 'round',
        segments: [
          ...pts.map((p, i): Segment => ({ op: i === 0 ? 'M' : 'L', p })),
          ...(part.closed ? [{ op: 'Z' } as const] : []),
        ],
      });
    }
  }
  return items;
};

const nodeItems = (model: PlotModel, connected: ReadonlySet<string>, layers: ReadonlySet<PlotLayer>): SceneItem[] => {
  const items: SceneItem[] = [];
  for (const node of model.nodes) {
    if (!connected.has(node.id)) continue;
    if (layers.has('nodes')) {
      items.push({
        kind: 'circle',
        group: 'nodes',
        layer: LAYERS.hinge,
        at: anchor(node.x, node.z),
        r: 5,
        tone: 'brand',
        width: 2,
        fill: 'paper',
      });
    }
    if (layers.has('nodeLabels')) {
      // Diagonally out of the corner the members leave free, as the website labels A-D; the other
      // free directions are kept in reserve for when a load arrow takes the first.
      const away = awayFrom(model, node, { x: 0, y: -1 });
      const used = [
        { x: -away.x, y: -away.y },
        { x: 0, y: 1 },
      ];
      const [first, ...rest] = rankedDirections(used, { x: -0.7, y: -0.7 }).map((dir) =>
        placeText(anchor(node.x, node.z), dir, 9)
      );
      items.push({
        kind: 'text',
        group: 'nodeLabels',
        layer: LAYERS.label,
        text: node.id,
        tone: 'ink',
        priority: 9,
        weight: 600,
        ...first,
        alternatives: rest.slice(0, 5),
      });
    }
  }
  return items;
};

/** Overall width under the structure and height to its right, as BuildSteps draws them. */
const dimensionItems = (
  model: PlotModel,
  options: StructureSceneOptions,
  fmt: (v: number, u: Unit) => string
): SceneItem[] => {
  const xs = model.nodes.map((n) => n.x);
  const zs = model.nodes.map((n) => n.z);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const items: SceneItem[] = [];
  const line = (a: Anchor, b: Anchor): SceneItem => ({
    kind: 'path',
    group: 'dimensions',
    layer: LAYERS.member,
    tone: 'muted',
    width: 1,
    segments: [
      { op: 'M', p: a },
      { op: 'L', p: b },
    ],
  });
  // Clear of the reactions when both are in the layout.
  const below = options.layers.has('reactions') ? 92 : 52;
  const right = options.layers.has('reactions') ? 104 : 58;
  if (x1 - x0 > 1e-9) {
    items.push(line(anchor(x0, z1, 0, below), anchor(x1, z1, 0, below)));
    for (const x of [x0, x1]) items.push(line(anchor(x, z1, 0, below - 8), anchor(x, z1, 0, below + 8)));
    items.push({
      ...text(
        'dimensions',
        anchor((x0 + x1) / 2, z1, 0, below),
        { x: 0, y: -1 },
        5,
        fmt(x1 - x0, options.units.length),
        'muted',
        9
      ),
    });
  }
  if (z1 - z0 > 1e-9) {
    items.push(line(anchor(x1, z0, right, 0), anchor(x1, z1, right, 0)));
    for (const z of [z0, z1]) items.push(line(anchor(x1, z, right - 8, 0), anchor(x1, z, right + 8, 0)));
    items.push(
      text(
        'dimensions',
        anchor(x1, (z0 + z1) / 2, right, 0),
        { x: 1, y: 0 },
        8,
        fmt(z1 - z0, options.units.length),
        'muted',
        9
      )
    );
  }
  return items;
};

/* ── Loads ──────────────────────────────────────────────────────────────────────────────── */

/** A member-local or global (fx, fz) as a screen vector. */
const toScreen = (f: MemberFrame, fx: number, fz: number, local: boolean): Vec =>
  local ? { x: fx * f.tx + fz * f.nx, y: fx * f.tz + fz * f.nz } : { x: fx, y: fz };

const LOAD_PRIORITY = 5;

const distributedItems = (
  load: Extract<PlotLoad, { kind: 'distributed' }>,
  f: MemberFrame,
  options: StructureSceneOptions,
  size: Sizes,
  fmt: (v: number, u: Unit) => string,
  labelled = true
): SceneItem[] => {
  const q0 = toScreen(f, load.start.fx, load.start.fz, load.local);
  const q1 = toScreen(f, load.end.fx, load.end.fz, load.local);
  const m0 = Math.hypot(q0.x, q0.y);
  const m1 = Math.hypot(q1.x, q1.y);
  if (m0 === 0 && m1 === 0) return [];
  // One direction for the whole load, that of its larger end; a load that changes sign keeps it
  // and its arrows turn round where it passes zero.
  const d = m1 > m0 ? unit(q1.x, q1.y) : unit(q0.x, q0.y);
  const v0 = q0.x * d.x + q0.y * d.y;
  const v1 = q1.x * d.x + q1.y * d.y;
  const vmax = Math.max(Math.abs(v0), Math.abs(v1));
  const uniform = Math.abs(v0 - v1) <= 1e-9 * vmax;
  const lengthPx = f.length * options.scale;
  const items: SceneItem[] = [];
  const thin = { width: 1.25, head: 6, headWidth: 6 };
  const value = (v: number) =>
    options.compact || !uniform
      ? fmt(Math.abs(v), options.units.distributed)
      : `q = ${fmt(Math.abs(v), options.units.distributed)}`;

  if (Math.abs(d.x * f.tz - d.y * f.tx) < 0.1) {
    // Along the member: short arrows on a line beside it.
    const off = { x: -f.nx * 10, y: -f.nz * 10 };
    const count = Math.max(1, Math.round(lengthPx / 30));
    for (let i = 0; i < count; i++) {
      const x = ((i + 0.5) * f.length) / count;
      const v = v0 + ((v1 - v0) * x) / f.length;
      if (Math.abs(v) < 1e-9 * vmax) continue;
      const s = Math.sign(v);
      items.push(
        ...arrow(
          'loads',
          at(f, x),
          { x: off.x - s * d.x * 8, y: off.y - s * d.y * 8 },
          { x: off.x + s * d.x * 8, y: off.y + s * d.y * 8 },
          'load',
          LAYERS.load,
          thin
        )
      );
    }
    items.push(
      text('loads', at(f, f.length / 2, off.x, off.y), unit(-f.nx, -f.nz), 8, value(vmax), 'load', LOAD_PRIORITY)
    );
    return items;
  }

  // Arrow tips stop short of the member's stroke, as in the website's figures.
  const tipGap = size.member / 2 + 2;
  const lengthAt = (v: number) => (size.udlArrow * v) / vmax;
  const count = Math.max(2, Math.round(lengthPx / size.udlSpacing));
  for (let i = 0; i <= count; i++) {
    const x = (i * f.length) / count;
    const v = v0 + ((v1 - v0) * i) / count;
    const len = lengthAt(v);
    if (Math.abs(len) < tipGap + 6) continue;
    const s = Math.sign(len);
    items.push(
      ...arrow(
        'loads',
        at(f, x),
        { x: -d.x * len, y: -d.y * len },
        { x: -d.x * s * tipGap, y: -d.y * s * tipGap },
        'load',
        LAYERS.load,
        thin
      )
    );
  }
  const tail = (x: number, v: number) => at(f, x, -d.x * lengthAt(v), -d.y * lengthAt(v));
  items.push({
    kind: 'path',
    group: 'loads',
    layer: LAYERS.load,
    tone: 'load',
    width: 1.25,
    obstacle: true,
    segments: [
      { op: 'M', p: tail(0, v0) },
      { op: 'L', p: tail(f.length, v1) },
    ],
  });

  const out = unit(-d.x, -d.y);
  const forwardStart: TextAlign = f.tx >= 0 ? 'start' : 'end';
  const forwardEnd: TextAlign = f.tx >= 0 ? 'end' : 'start';
  const ends = uniform
    ? ([[0, v0, forwardStart]] as const)
    : ([
        [0, v0, forwardStart],
        [f.length, v1, forwardEnd],
      ] as const);
  for (const [x, v, inward] of labelled ? ends : []) {
    if (Math.abs(v) < 1e-9 * vmax) continue;
    const placed = placeText(tail(x, v), Math.sign(v) >= 0 ? out : { x: -out.x, y: -out.y }, 6);
    // Over the end of the band, reading inward (BuildSteps writes q over the beam's left end).
    items.push({
      kind: 'text',
      group: 'loads',
      layer: LAYERS.label,
      text: value(v),
      tone: 'load',
      priority: LOAD_PRIORITY,
      ...placed,
      align: placed.baseline === 'middle' ? placed.align : inward,
    });
  }
  return items;
};

const pointForceItems = (origin: Anchor, force: Vec, content: string, size: Sizes, gap: number): SceneItem[] => {
  const d = unit(force.x, force.y);
  const tip = { x: -d.x * gap, y: -d.y * gap };
  const tail = { x: -d.x * (gap + size.pointArrow), y: -d.y * (gap + size.pointArrow) };
  return [
    ...arrow('loads', origin, tail, tip, 'load', LAYERS.load, {
      width: size.pointShaft,
      head: size.pointHead,
      headWidth: size.pointHeadWidth,
      obstacle: true,
    }),
    {
      ...text('loads', shift(origin, tail.x, tail.y), { x: -d.x, y: -d.y }, 5, content, 'load', LOAD_PRIORITY),
      weight: 600,
    },
  ];
};

const pointMomentItems = (origin: Anchor, my: number, gap: Vec, content: string, size: Sizes): SceneItem[] => {
  const dir = freeDirection([gap], { x: 0.7, y: -0.7 });
  return [
    ...momentArc('loads', origin, size.arc, my > 0, gap, 'load', LAYERS.load),
    text('loads', shift(origin, dir.x * size.arc, dir.y * size.arc), dir, 4, content, 'load', LOAD_PRIORITY),
  ];
};

const temperatureItems = (
  load: Extract<PlotLoad, { kind: 'temperature' }>,
  f: MemberFrame,
  units: Units,
  fmt: (v: number, u: Unit) => string
): SceneItem[] => {
  const parts: string[] = [];
  if (load.uniform !== 0) parts.push(`ΔT = ${fmt(load.uniform, units.temperature)}`);
  if (load.gradient !== 0) parts.push(`ΔTb − ΔTt = ${fmt(load.gradient, units.temperature)}`);
  if (parts.length === 0) return [];
  let angle = (Math.atan2(f.tz, f.tx) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  const r = (angle * Math.PI) / 180;
  // Under the member as the text reads: above it the deformed shape bows through the words.
  const down = { x: -Math.sin(r), y: Math.cos(r) };
  const items: SceneItem[] = [
    {
      kind: 'text',
      group: 'loads',
      layer: LAYERS.label,
      at: at(f, f.length / 2, down.x * 9, down.y * 9),
      text: parts.join(', '),
      tone: 'load',
      align: 'middle',
      baseline: 'top',
      priority: LOAD_PRIORITY,
      rotate: angle,
    },
  ];
  if (load.gradient !== 0) {
    // The warmer face, dotted along the member: the side that lengthens.
    const s = -Math.sign(load.gradient) * 5;
    items.push({
      kind: 'path',
      group: 'loads',
      layer: LAYERS.load,
      tone: 'load',
      width: 2,
      dash: '1 4',
      cap: 'round',
      segments: [
        { op: 'M', p: at(f, 0, f.nx * -s, f.nz * -s) },
        { op: 'L', p: at(f, f.length, f.nx * -s, f.nz * -s) },
      ],
    });
  }
  return items;
};

const prescribedItems = (
  load: Extract<PlotLoad, { kind: 'prescribed' }>,
  node: PlotNode,
  away: Vec,
  units: Units,
  size: Sizes,
  fmt: (v: number, u: Unit) => string
): SceneItem[] => {
  const items: SceneItem[] = [];
  const origin = anchor(node.x, node.z);
  const c = Math.cos(node.angle);
  const s = Math.sin(node.angle);
  const dx = load.dx ?? 0;
  const dz = load.dz ?? 0;
  if (dx !== 0 || dz !== 0) {
    const d = unit(dx * c - dz * s, dx * s + dz * c);
    // Beside the support, on the side away from the members, dashed: a movement, not a force.
    const perp = { x: -d.y, y: d.x };
    const side = perp.x * away.x + perp.y * away.y >= 0 ? 1 : -1;
    const o = { x: perp.x * side * 30, y: perp.y * side * 30 };
    const tip = { x: o.x + d.x * 20, y: o.y + d.y * 20 };
    items.push(
      ...arrow('loads', origin, { x: o.x - d.x * 12, y: o.y - d.y * 12 }, tip, 'load', LAYERS.load, {
        width: 1.5,
        head: 7,
        headWidth: 7,
        dash: '4 3',
      }),
      text(
        'loads',
        shift(origin, tip.x, tip.y),
        d,
        4,
        fmt(Math.hypot(dx, dz), units.displacement),
        'load',
        LOAD_PRIORITY
      )
    );
  }
  if (load.ry) {
    const gap = { x: -away.x, y: -away.y };
    items.push(...momentArc('loads', origin, size.arc + 6, load.ry > 0, gap, 'load', LAYERS.load, '4 3'));
    const t = freeDirection([gap], { x: 0.7, y: -0.7 });
    items.push(
      text(
        'loads',
        shift(origin, t.x * (size.arc + 6), t.y * (size.arc + 6)),
        t,
        4,
        fmt(Math.abs(load.ry), units.rotation),
        'load',
        LOAD_PRIORITY
      )
    );
  }
  return items;
};

/**
 * A uniform load that carries straight on from the same load on the previous, collinear member:
 * one band to the reader, so it is labelled once, where it starts.
 */
const continuesLoad = (
  model: PlotModel,
  frames: ReadonlyMap<string, MemberFrame>,
  load: Extract<PlotLoad, { kind: 'distributed' }>
): boolean => {
  const member = model.members.find((m) => m.id === load.member);
  const f = frames.get(load.member);
  if (!member || !f) return false;
  const same = (a: { fx: number; fz: number }, b: { fx: number; fz: number }) => a.fx === b.fx && a.fz === b.fz;
  return model.loads.some((other) => {
    if (other === load || other.kind !== 'distributed' || other.local !== load.local) return false;
    const prev = model.members.find((m) => m.id === other.member);
    const g = frames.get(other.member);
    return (
      !!prev &&
      !!g &&
      prev.end === member.start &&
      Math.abs(f.tx * g.tx + f.tz * g.tz - 1) < 1e-9 &&
      same(other.end, load.start) &&
      same(other.start, other.end) &&
      same(load.start, load.end)
    );
  });
};

const loadItems = (
  model: PlotModel,
  frames: ReadonlyMap<string, MemberFrame>,
  options: StructureSceneOptions,
  size: Sizes,
  fmt: (v: number, u: Unit) => string
): SceneItem[] => {
  const nodes = nodeMap(model);
  const items: SceneItem[] = [];
  const { units } = options;
  const gap = size.member / 2 + 2;
  for (const load of model.loads) {
    switch (load.kind) {
      case 'nodalForce': {
        const node = nodes.get(load.node);
        if (node) {
          const content = fmt(Math.hypot(load.fx, load.fz), units.force);
          items.push(...pointForceItems(anchor(node.x, node.z), { x: load.fx, y: load.fz }, content, size, gap + 1));
        }
        break;
      }
      case 'nodalMoment': {
        const node = nodes.get(load.node);
        if (node) {
          const away = awayFrom(model, node, { x: 0, y: 1 });
          const content = fmt(Math.abs(load.my), units.moment);
          items.push(...pointMomentItems(anchor(node.x, node.z), load.my, { x: -away.x, y: -away.y }, content, size));
        }
        break;
      }
      case 'distributed': {
        const f = frames.get(load.member);
        if (f) items.push(...distributedItems(load, f, options, size, fmt, !continuesLoad(model, frames, load)));
        break;
      }
      case 'pointForce': {
        const f = frames.get(load.member);
        if (f) {
          const force = toScreen(f, load.fx, load.fz, load.local);
          items.push(
            ...pointForceItems(at(f, load.at), force, fmt(Math.hypot(load.fx, load.fz), units.force), size, gap)
          );
        }
        break;
      }
      case 'pointMoment': {
        const f = frames.get(load.member);
        if (f) {
          const content = fmt(Math.abs(load.my), units.moment);
          items.push(...pointMomentItems(at(f, load.at), load.my, { x: f.nx, y: f.nz }, content, size));
        }
        break;
      }
      case 'temperature': {
        const f = frames.get(load.member);
        if (f) items.push(...temperatureItems(load, f, units, fmt));
        break;
      }
      case 'prescribed': {
        const node = nodes.get(load.node);
        if (node) items.push(...prescribedItems(load, node, awayFrom(model, node, { x: 1, y: 0 }), units, size, fmt));
        break;
      }
    }
  }
  return items;
};

/* ── Reactions ──────────────────────────────────────────────────────────────────────────────── */

const REACTION_PRIORITY = 5;

/**
 * Reactions as forces on the structure, clear of the support as BuildSteps draws them. One along
 * the support's ground direction stands beyond the symbol, pointing at it when it pushes; one
 * across it lies just under the symbol's base, on the side it pushes from.
 */
const reactionItems = (
  model: PlotModel,
  reactions: readonly PlotReaction[],
  options: StructureSceneOptions,
  size: Sizes,
  fmt: (v: number, u: Unit) => string
): SceneItem[] => {
  const items: SceneItem[] = [];
  const nodes = nodeMap(model);
  const byNode = new Map<string, PlotReaction[]>();
  for (const r of reactions) if (r.value !== 0) byNode.set(r.node, [...(byNode.get(r.node) ?? []), r]);
  const style = { width: 1.75, head: 9, headWidth: 9, obstacle: true };

  for (const [id, list] of byNode) {
    const node = nodes.get(id);
    if (!node) continue;
    const origin = anchor(node.x, node.z);
    const placement = supportPlacement(model, node);
    const ground = groundDirection(placement.rotation);
    const g = { x: ground.x, y: ground.z };
    // The glyph's own x axis: "across" the support.
    const across = { x: g.y, y: -g.x };
    const m = memberDirections(model, node);
    const used: Vec[] = Math.hypot(m.x, m.z) > 1e-9 ? [unit(m.x, m.z)] : [];
    const moment = list.find((r) => r.dof === 'ry');
    const arcR = size.reactionArc;
    const reach = glyphReach(placement.kind, placement.rotation, g.x, g.y);
    const clear = moment ? arcR + 8 : 0;

    for (const r of list) {
      if (r.dof === 'ry') continue;
      const c = Math.cos(node.angle);
      const s = Math.sin(node.angle);
      const axis = r.dof === 'dx' ? { x: c, y: s } : { x: -s, y: c };
      const f = { x: axis.x * r.value, y: axis.y * r.value };
      const fd = unit(f.x, f.y);
      const value = fmt(Math.abs(r.value), options.units.force);
      if (Math.abs(axis.x * g.x + axis.y * g.y) > 0.7) {
        const near = Math.max(reach + size.reactionGap, clear);
        const far = near + size.reaction;
        const pNear = { x: g.x * near, y: g.y * near };
        const pFar = { x: g.x * far, y: g.y * far };
        const pushes = fd.x * g.x + fd.y * g.y < 0;
        items.push(
          ...arrow(
            'reactions',
            origin,
            pushes ? pFar : pNear,
            pushes ? pNear : pFar,
            'reaction',
            LAYERS.reaction,
            style
          )
        );
        // The value beside the tail, as the website writes it.
        const side = across.x >= 0 ? across : { x: -across.x, y: -across.y };
        const labelAt = shift(origin, pFar.x - g.x * 6, pFar.y - g.y * 6);
        // Beside it on the other side when the first is taken or off the edge (a right-hand support).
        items.push({
          ...text('reactions', labelAt, side, 7, value, 'reaction', REACTION_PRIORITY),
          alternatives: [placeText(labelAt, { x: -side.x, y: -side.y }, 7)],
        });
        used.push(g);
      } else {
        // Under the symbol's base, entering from the side the force comes from.
        const down = Math.max(reach + (options.compact ? 4 : 6), clear);
        const from = fd.x * across.x + fd.y * across.y > 0 ? -1 : 1;
        const o = { x: g.x * down, y: g.y * down };
        const tail = {
          x: o.x + across.x * from * (14 + size.reaction - 4),
          y: o.y + across.y * from * (14 + size.reaction - 4),
        };
        const tip = { x: o.x + across.x * from * 14, y: o.y + across.y * from * 14 };
        items.push(...arrow('reactions', origin, tail, tip, 'reaction', LAYERS.reaction, style));
        items.push(
          text(
            'reactions',
            shift(origin, tail.x, tail.y),
            unit(tail.x - tip.x, tail.y - tip.y),
            4,
            value,
            'reaction',
            REACTION_PRIORITY
          )
        );
        used.push({ x: across.x * from, y: across.y * from });
      }
    }

    if (moment) {
      const gap = used[0] ?? { x: 0, y: -1 };
      // A half circle on the support's side only: a fuller arc reaches round into the diagrams
      // that start at this node.
      items.push(
        ...momentArc('reactions', origin, arcR, moment.value > 0, gap, 'reaction', LAYERS.reaction, undefined, 190)
      );
      const t = freeDirection(used, { x: 0.7, y: -0.7 });
      items.push(
        text(
          'reactions',
          shift(origin, t.x * arcR, t.y * arcR),
          t,
          5,
          fmt(Math.abs(moment.value), options.units.moment),
          'reaction',
          REACTION_PRIORITY
        )
      );
    }
  }
  return items;
};

/* ── Diagrams ───────────────────────────────────────────────────────────────────────────────── */

/** Which way a positive value is drawn, along the member's local z: +1 toward local +z. */
export const diagramSide = (q: InternalForce, momentOnTensionSide: boolean): 1 | -1 =>
  q === 'M' ? (momentOnTensionSide ? 1 : -1) : -1;

const pieceSegments = (f: MemberFrame, piece: Piece, k: number, normal: Vec): Segment[] =>
  pieceToBeziers(piece).map(([, c1, c2, p]) => ({
    op: 'C' as const,
    c1: at(f, c1[0], normal.x * k * c1[1], normal.y * k * c1[1]),
    c2: at(f, c2[0], normal.x * k * c2[1], normal.y * k * c2[1]),
    p: at(f, p[0], normal.x * k * p[1], normal.y * k * p[1]),
  }));

/** The outline and the ordinates of one member's diagram. */
const diagramShape = (
  group: PlotLayer,
  f: MemberFrame,
  pw: Piecewise,
  tone: Tone,
  k: number,
  normal: Vec,
  scale: number,
  closed: readonly [boolean, boolean]
): SceneItem[] => {
  const outline: Segment[] = [];
  pw.forEach((piece, i) => {
    const v0 = evalPiece(piece, piece.x0);
    const p0 = at(f, piece.x0, normal.x * k * v0, normal.y * k * v0);
    if (i === 0) {
      // Where the next member carries the same ordinate on (a continuous beam over a joint),
      // the outline runs straight on: no line back to the axis.
      outline.push(closed[0] ? { op: 'M', p: at(f, 0) } : { op: 'M', p: p0 });
      if (closed[0]) outline.push({ op: 'L', p: p0 });
    } else {
      // A jump between pieces is this straight line across the member: a step, not a slope.
      outline.push({ op: 'L', p: p0 });
    }
    outline.push(...pieceSegments(f, piece, k, normal));
  });
  if (closed[1]) outline.push({ op: 'L', p: at(f, f.length) });

  const lengthPx = f.length * scale;
  const count = Math.floor(lengthPx / HATCH_SPACING_PX);
  const startPx = (lengthPx - count * HATCH_SPACING_PX) / 2;
  const hatch: Segment[] = [];
  for (let i = 0; i <= count; i++) {
    const x = (startPx + i * HATCH_SPACING_PX) / scale;
    const v = valueAt(pw, x);
    if (Math.abs(v * k) < 1.5) continue;
    hatch.push({ op: 'M', p: at(f, x) }, { op: 'L', p: at(f, x, normal.x * k * v, normal.y * k * v) });
  }

  const items: SceneItem[] = [{ kind: 'path', group, layer: LAYERS.diagramLine, tone, width: 1.75, segments: outline }];
  if (hatch.length > 0) {
    items.push({
      kind: 'path',
      group,
      layer: LAYERS.diagramHatch,
      tone,
      width: 1,
      opacity: 0.55,
      fitIgnore: true,
      cap: 'butt',
      segments: hatch,
    });
  }
  return items;
};

/** A value worth writing, before placement: who it belongs to, how big, and where. */
interface LabelCandidate {
  readonly item: SceneText;
  readonly members: readonly string[];
  readonly magnitude: number;
}

/**
 * Where a value goes: just beyond the tip of the ordinate it denotes, along that ordinate, so it
 * reads as the ordinate's continuation. With `axis` the text turns to run along the ordinate
 * (across the member), as the app writes it, never upside down. Each further place moves it
 * outward along the same ordinate - it never leaves its tip.
 */
export const tipPlacements = (tip: Anchor, out: Vec, mode: ResultLabelMode, gaps = [5, 11, 17]): TextPlacement[] =>
  gaps.flatMap((gap): TextPlacement[] => {
    if (mode === 'horizontal') {
      const p = placeText(tip, out, gap);
      // Still hanging from the tip, but reaching to one side of it: clear of a member that meets
      // the ordinate there, as a column does under a beam's corner value.
      // A few pixels aside, so the text does not start right on the member it clears.
      return p.baseline === 'middle'
        ? [p, { ...p, at: shift(p.at, 0, 4), baseline: 'top' }, { ...p, at: shift(p.at, 0, -4), baseline: 'bottom' }]
        : [p, { ...p, at: shift(p.at, 4, 0), align: 'start' }, { ...p, at: shift(p.at, -4, 0), align: 'end' }];
    }
    let angle = (Math.atan2(out.y, out.x) * 180) / Math.PI;
    // Across a horizontal member the text reads upward, as the app turns it.
    if (Math.abs(Math.abs(angle) - 90) < 1e-6) angle = -90;
    else if (angle > 90) angle -= 180;
    else if (angle <= -90) angle += 180;
    const r = (angle * Math.PI) / 180;
    const along = Math.cos(r) * out.x + Math.sin(r) * out.y;
    const p: TextPlacement = {
      at: shift(tip, out.x * gap, out.y * gap),
      align: along < 0 ? 'end' : 'start',
      baseline: 'middle',
      rotate: angle,
    };
    // Beside the ordinate's line instead of on it: the text's own up and down, turned.
    const side = { x: -Math.sin(r) * 4, y: Math.cos(r) * 4 };
    return [
      p,
      { ...p, at: shift(p.at, side.x, side.y), baseline: 'top' },
      { ...p, at: shift(p.at, -side.x, -side.y), baseline: 'bottom' },
    ];
  });

/**
 * The numbers on one diagram: every value at the tip of its own ordinate. A rigid corner is
 * written once, at the tip of the member with more room around it (the other's tip in reserve); a
 * step shows both its values; an interior extreme carries the unit; a member end is written where
 * it is that member's largest or smallest value, or where members meet.
 */
const diagramLabels = (
  model: PlotModel,
  frames: ReadonlyMap<string, MemberFrame>,
  results: Readonly<Record<string, MemberResults>>,
  q: InternalForce,
  k: number,
  side: 1 | -1,
  options: StructureSceneOptions
): LabelCandidate[] => {
  const unitOf = q === 'M' ? options.units.moment : options.units.force;
  const tone = DIAGRAM_TONE[q];
  const mode = options.resultLabelMode ?? 'horizontal';
  const largest = Math.max(0, ...model.members.map((m) => maxAbs(results[m.id]?.[q] ?? [])));
  if (!(largest > 0)) return [];
  const zero = 1e-6 * largest;
  const close = (a: number, b: number) => Math.abs(a - b) <= 1e-4 * largest;
  const number = (v: number) => formatNumber(v * unitOf.scale, options.numberFormat);
  const priority = (v: number) => 6 + Math.abs(v) / largest;
  const candidates: LabelCandidate[] = [];

  const normalOf = (f: MemberFrame): Vec => ({ x: f.nx * side, y: f.nz * side });
  const isConstant = (pw: Piecewise) =>
    pw.every((p) => (pieceDegree(p) ?? 0) === 0 && close(evalPiece(p, p.x0), evalPiece(pw[0], pw[0].x0)));

  const push = (places: readonly TextPlacement[], content: string, v: number, members: string[]) => {
    const [first, ...rest] = places;
    candidates.push({
      item: {
        kind: 'text',
        group: q,
        layer: LAYERS.label,
        text: content,
        tone,
        priority: priority(v),
        ...first,
        alternatives: rest,
      },
      members,
      magnitude: Math.abs(v),
    });
  };

  // Member ends, gathered per node.
  for (const node of model.nodes) {
    const ends = model.members.flatMap((m) => {
      const pw = results[m.id]?.[q];
      const f = frames.get(m.id);
      if (!pw || pw.length === 0 || !f || isConstant(pw)) return [];
      const end = m.start === node.id ? 0 : m.end === node.id ? 1 : -1;
      if (end === -1) return [];
      const x = end === 0 ? 0 : f.length;
      const v = valueAt(pw, x, end === 0 ? 'right' : 'left');
      if (Math.abs(v) <= zero) return [];
      const n = normalOf(f);
      const e = extremes(pw);
      const extreme = !!e && (close(v, e.max.value) || close(v, e.min.value));
      // The member leaves the node this way.
      const away = end === 0 ? { x: f.tx, y: f.tz } : { x: -f.tx, y: -f.tz };
      return [
        {
          m,
          f,
          v,
          extreme,
          away,
          out: { x: n.x * Math.sign(v), y: n.y * Math.sign(v) },
          tip: at(f, x, n.x * k * v, n.y * k * v),
        },
      ];
    });
    if (ends.length === 0) continue;

    if (ends.length >= 2 && ends.every((e) => close(Math.abs(e.v), Math.abs(ends[0].v)))) {
      // One value for the joint. The ordinate that points along another member is crowded by that
      // member's own diagram; the one pointing away from every other member has the room.
      const crowding = (e: (typeof ends)[number]) =>
        Math.max(-1, ...ends.filter((o) => o !== e).map((o) => e.out.x * o.away.x + e.out.y * o.away.y));
      const ranked = [...ends].sort((a, b) => crowding(a) - crowding(b) || Math.abs(b.f.tx) - Math.abs(a.f.tx));
      const places = ranked.flatMap((e) => tipPlacements(e.tip, e.out, mode));
      const shown = ranked[0].v;
      push(
        places,
        number(shown),
        shown,
        ends.map((e) => e.m.id)
      );
      continue;
    }
    for (const e of ends) {
      if (!e.extreme && ends.length < 2) continue;
      push(tipPlacements(e.tip, e.out, mode), number(e.v), e.v, [e.m.id]);
    }
  }

  // Along each member.
  for (const m of model.members) {
    const pw = results[m.id]?.[q];
    const f = frames.get(m.id);
    if (!pw || pw.length === 0 || !f) continue;
    const n = normalOf(f);
    const tipAt = (x: number, v: number) => at(f, x, n.x * k * v, n.y * k * v);
    const outOf = (v: number) => ({ x: n.x * Math.sign(v), y: n.y * Math.sign(v) });
    if (isConstant(pw)) {
      const v = evalPiece(pw[0], pw[0].x0);
      if (Math.abs(v) > zero) push(tipPlacements(tipAt(f.length / 2, v), outOf(v), mode), number(v), v, [m.id]);
      continue;
    }
    for (const b of innerBreaks(pw)) {
      const left = valueAt(pw, b, 'left');
      const right = valueAt(pw, b, 'right');
      if (close(left, right)) {
        if (Math.abs(left) > zero) push(tipPlacements(tipAt(b, left), outOf(left), mode), number(left), left, [m.id]);
        continue;
      }
      // A step: both tips, the value just before and just after.
      for (const v of [left, right]) {
        if (Math.abs(v) > zero) push(tipPlacements(tipAt(b, v), outOf(v), mode), number(v), v, [m.id]);
      }
    }
    for (const p of pw) {
      for (const x of pieceExtrema(p)) {
        const v = evalPiece(p, x);
        if (Math.abs(v) > zero) push(tipPlacements(tipAt(x, v), outOf(v), mode), number(v), v, [m.id]);
      }
    }
  }
  return candidates;
};

/** The drawn ordinate at a member end, in px per unit k: value × the side's normal. */
const endOrdinate = (f: MemberFrame, pw: Piecewise, side: 1 | -1, end: 0 | 1): Vec => {
  const v = valueAt(pw, end === 0 ? 0 : f.length, end === 0 ? 'right' : 'left');
  return { x: f.nx * side * v, y: f.nz * side * v };
};

/**
 * Whether the diagram runs straight on into a collinear member at this end with the same ordinate,
 * as a moment does over the joint of a continuous beam: there is no step to draw.
 */
const continuesInto = (
  model: PlotModel,
  frames: ReadonlyMap<string, MemberFrame>,
  results: Readonly<Record<string, MemberResults>>,
  q: InternalForce,
  side: 1 | -1,
  member: PlotMember,
  end: 0 | 1
): boolean => {
  const node = end === 0 ? member.start : member.end;
  const f = frameOf(frames, member.id);
  const own = endOrdinate(f, results[member.id][q], side, end);
  const scale = Math.max(1e-30, ...model.members.map((m) => maxAbs(results[m.id]?.[q] ?? [])));
  return model.members.some((other) => {
    if (other.id === member.id || !results[other.id]) return false;
    const otherEnd = other.start === node ? 0 : other.end === node ? 1 : -1;
    if (otherEnd === -1) return false;
    const g = frameOf(frames, other.id);
    if (Math.abs(f.tx * g.tx + f.tz * g.tz) < 0.999) return false;
    const o = endOrdinate(g, results[other.id][q], side, otherEnd as 0 | 1);
    return Math.hypot(o.x - own.x, o.y - own.y) <= 1e-4 * scale;
  });
};

/** Every member carries one constant normal force and no member loads: a truss, read bar by bar. */
const isBarStructure = (model: PlotModel, results: Readonly<Record<string, MemberResults>>): boolean =>
  !model.loads.some((l) => 'member' in l) &&
  model.members.every((m) => {
    const pw = results[m.id]?.N ?? [];
    return pw.every((p) => (pieceDegree(p) ?? 0) === 0);
  });

/**
 * A truss's normal forces as numbers along the bars, as a textbook writes them: one per bar, beside
 * it and turned to read along it. Ordinate bands on every bar of a truss only hide one another.
 */
const barForceLabels = (
  model: PlotModel,
  frames: ReadonlyMap<string, MemberFrame>,
  results: Readonly<Record<string, MemberResults>>,
  options: StructureSceneOptions
): SceneItem[] => {
  const largest = Math.max(0, ...model.members.map((m) => maxAbs(results[m.id]?.N ?? [])));
  const unit = options.units.force;
  const number = (v: number) => formatNumber(v * unit.scale, options.numberFormat);
  const base = options.fontSize ?? 13;
  // Down to about 10 px, never up.
  const sizes = [...new Set([base, Math.max(10, Math.min(base, 11)), Math.min(base, 10)])];
  const xs = model.nodes.map((n) => n.x);
  const centre = (Math.min(...xs) + Math.max(...xs)) / 2;
  const span = Math.max(...xs) - Math.min(...xs) || 1;

  const bars = model.members.flatMap((m) => {
    const pw = results[m.id]?.N;
    const f = frames.get(m.id);
    if (!pw || pw.length === 0 || !f) return [];
    const v = evalPiece(pw[0], pw[0].x0);
    if (Math.abs(v) <= 1e-6 * largest) return [];
    const mid = pointAlong(f, f.length / 2);
    return [{ m, f, v, mid }];
  });

  /**
   * The mirror image of an earlier bar with the same force: if anything has to go, it goes first -
   * a reader still has its twin. Every other bar's force must be found by the reader somewhere.
   */
  const isTwin = (bar: (typeof bars)[number], i: number) =>
    bars
      .slice(0, i)
      .some(
        (o) =>
          number(o.v) === number(bar.v) &&
          Math.abs(o.mid.x + bar.mid.x - 2 * centre) < 1e-6 * span &&
          Math.abs(o.mid.z - bar.mid.z) < 1e-6 * span
      );

  return bars.map(({ f, v }, i): SceneItem => {
    let angle = (Math.atan2(f.tz, f.tx) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle <= -90) angle += 180;
    const r = (angle * Math.PI) / 180;
    // "Up" as the text reads, whichever way the bar was drawn.
    const up = { x: Math.sin(r), y: -Math.cos(r) };
    const full = number(v);
    const texts = [...new Set([full, number(v)])];
    // Anywhere in the middle 60 % of the bar, from the middle outward, clear of the joints.
    const positions = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
    const places: TextPlacement[] = [];
    // In order: slide along the bar, then flip to its other side, then a smaller font, then no unit.
    for (const content of texts) {
      for (const size of sizes) {
        for (const side of [1, -1]) {
          for (const t of positions) {
            places.push({
              at: at(f, f.length * t, up.x * 3 * side, up.y * 3 * side),
              align: 'middle',
              baseline: side > 0 ? 'bottom' : 'top',
              text: content,
              size: size === base ? undefined : size,
            });
          }
        }
      }
    }
    const [first, ...rest] = places;
    return {
      kind: 'text',
      group: 'N',
      layer: LAYERS.label,
      // Tension red, compression blue, as a truss is read at a glance
      tone: v > 0 ? 'tension' : v < 0 ? 'compression' : 'normal',
      text: full,
      ...first,
      priority: (isTwin(bars[i], i) ? 5 : 7) + Math.abs(v) / largest,
      rotate: angle,
      alternatives: rest,
    };
  });
};

/** In a thumbnail, each member keeps its two largest values; a corner counts for both members. */
const limitPerMember = (candidates: readonly LabelCandidate[], limit: number): LabelCandidate[] => {
  const count = new Map<string, number>();
  return [...candidates]
    .sort((a, b) => b.magnitude - a.magnitude)
    .filter((c) => {
      if (c.members.some((m) => (count.get(m) ?? 0) >= limit)) return false;
      for (const m of c.members) count.set(m, (count.get(m) ?? 0) + 1);
      return true;
    });
};

/** The deformed shape of one member, displacements magnified to k px per metre. */
const deformedPath = (f: MemberFrame, r: MemberResults, k: number, width: number): SceneItem => {
  const segments: Segment[] = [];
  const offset = (x: number, u: number, w: number): Anchor =>
    at(f, x, k * (u * f.tx + w * f.nx), k * (u * f.tz + w * f.nz));
  r.w.forEach((wp, i) => {
    const up = r.u[i];
    const curved = Math.max(pieceDegree(wp) ?? 0, pieceDegree(up) ?? 0);
    const n = curved <= 1 ? 1 : curved <= 3 ? 2 : 6;
    const span = (wp.x1 - wp.x0) / n;
    if (i === 0) segments.push({ op: 'M', p: offset(wp.x0, evalPiece(up, wp.x0), evalPiece(wp, wp.x0)) });
    for (let j = 0; j < n; j++) {
      const a = wp.x0 + j * span;
      const b = a + span;
      const h = span / 3;
      const [ua, wa, ub, wb] = [evalPiece(up, a), evalPiece(wp, a), evalPiece(up, b), evalPiece(wp, b)];
      if (curved <= 1) {
        segments.push({ op: 'L', p: offset(b, ub, wb) });
        continue;
      }
      // Hermite control points of the parametric curve, split into model and pixel parts.
      segments.push({
        op: 'C',
        c1: offset(a + h, ua + h * evalPieceSlope(up, a), wa + h * evalPieceSlope(wp, a)),
        c2: offset(b - h, ub - h * evalPieceSlope(up, b), wb - h * evalPieceSlope(wp, b)),
        p: offset(b, ub, wb),
      });
    }
  });
  return { kind: 'path', group: 'w', layer: LAYERS.deformed, tone: 'deformed', width, cap: 'round', segments };
};

/** The largest displacement anywhere, for its one label. */
const largestDisplacement = (
  model: PlotModel,
  frames: ReadonlyMap<string, MemberFrame>,
  results: Readonly<Record<string, MemberResults>>
): { member: string; x: number; u: number; w: number } | null => {
  let best: { member: string; x: number; u: number; w: number } | null = null;
  let size = 0;
  for (const m of model.members) {
    const r = results[m.id];
    const f = frames.get(m.id);
    if (!r || !f) continue;
    for (const p of r.w) {
      const xs = [
        p.x0,
        p.x1,
        ...pieceExtrema(p),
        ...Array.from({ length: 9 }, (_, i) => p.x0 + ((i + 1) * (p.x1 - p.x0)) / 10),
      ];
      for (const x of xs) {
        const u = valueAt(r.u, x);
        const w = valueAt(r.w, x);
        if (Math.hypot(u, w) > size) {
          size = Math.hypot(u, w);
          best = { member: m.id, x, u, w };
        }
      }
    }
  }
  return best;
};

/* ── Putting it together ────────────────────────────────────────────────────────────────────── */

/** px per SI unit for each result, from the largest value anywhere in the structure. */
export const diagramScales = (
  model: PlotModel,
  options: Pick<StructureSceneOptions, 'diagramSize' | 'deformedSize' | 'diagramScale'>
): Record<ResultLayer, number> => {
  const results = Object.values(model.results?.members ?? {});
  const largest = (q: keyof MemberResults) => Math.max(0, ...results.map((r) => maxAbs(r[q])));
  const scaled = (q: ResultLayer, max: number, size: number) => options.diagramScale?.[q] ?? (max > 0 ? size / max : 0);
  return {
    N: scaled('N', largest('N'), options.diagramSize),
    V: scaled('V', largest('V'), options.diagramSize),
    M: scaled('M', largest('M'), options.diagramSize),
    w: scaled('w', Math.max(largest('u'), largest('w')), options.deformedSize),
  };
};

export const memberFrames = (model: PlotModel): Map<string, MemberFrame> => {
  const nodes = nodeMap(model);
  return new Map(model.members.map((m) => [m.id, memberFrame(model, m, nodes)]));
};

/**
 * The result a thumbnail shows when none is asked for: the moment for beams and frames, the
 * normal force for a truss (every member pinned, or bending negligible beside the axial forces),
 * the deformed shape when nothing carries a force (a free temperature load).
 */
export const defaultResultLayer = (model: PlotModel): ResultLayer | null => {
  const results = model.results;
  if (!results) return null;
  const all = Object.values(results.members);
  const largest = (q: InternalForce) => Math.max(0, ...all.map((r) => maxAbs(r[q])));
  const [N, V, M] = [largest('N'), largest('V'), largest('M')];
  if (N === 0 && V === 0 && M === 0) return 'w';
  if (model.members.length > 0 && model.members.every((m) => m.hinges[0] && m.hinges[1])) return 'N';
  const frames = memberFrames(model);
  const meanLength = [...frames.values()].reduce((s, f) => s + f.length, 0) / Math.max(1, frames.size);
  const memberLoads = model.loads.some((l) => 'member' in l);
  if (!memberLoads && M < 0.05 * N * meanLength) return 'N';
  return 'M';
};

export const buildStructureScene = (model: PlotModel, options: StructureSceneOptions): SceneItem[] => {
  const frames = memberFrames(model);
  const connected = new Set(model.members.flatMap((m) => [m.start, m.end]));
  const fmt = (v: number, u: Unit) => formatQuantity(v, u, options.numberFormat);
  const size = options.compact ? SIZES.compact : SIZES.full;
  const { layers } = options;
  const items: SceneItem[] = [];

  const results = model.results;
  if (results) {
    const k = diagramScales(model, options);
    for (const q of ['N', 'V', 'M'] as const) {
      if (!layers.has(q) || !(k[q] > 0)) continue;
      if (q === 'N' && isBarStructure(model, results.members)) {
        items.push(...barForceLabels(model, frames, results.members, options));
        continue;
      }
      const side = diagramSide(q, options.momentOnTensionSide);
      for (const m of model.members) {
        const r = results.members[m.id];
        const f = frameOf(frames, m.id);
        if (r && r[q].some((p) => pieceDegree(p) !== null)) {
          const normal = { x: f.nx * side, y: f.nz * side };
          const closed = [0, 1].map(
            (end) => !continuesInto(model, frames, results.members, q, side, m, end as 0 | 1)
          ) as [boolean, boolean];
          items.push(...diagramShape(q, f, r[q], DIAGRAM_TONE[q], k[q], normal, options.scale, closed));
        }
      }
      const labels = diagramLabels(model, frames, results.members, q, k[q], side, options);
      items.push(...(options.compact ? limitPerMember(labels, 2) : labels).map((c) => c.item));
    }
    if (layers.has('w') && k.w > 0) {
      for (const m of model.members) {
        const r = results.members[m.id];
        if (r) items.push(deformedPath(frameOf(frames, m.id), r, k.w, size.deformed));
      }
      const peak = largestDisplacement(model, frames, results.members);
      if (peak) {
        const f = frameOf(frames, peak.member);
        const d = { x: peak.u * f.tx + peak.w * f.nx, y: peak.u * f.tz + peak.w * f.nz };
        const p = at(f, peak.x, k.w * d.x, k.w * d.y);
        items.push(
          text(
            'w',
            p,
            unit(d.x, d.y),
            5,
            formatNumber(Math.hypot(peak.u, peak.w) * options.units.displacement.scale, options.numberFormat),
            'deformed',
            7
          )
        );
      }
    }
  }

  if (layers.has('members')) items.push(...memberItems(model, frames, size), ...hingeItems(model, frames, size));
  if (layers.has('supports')) items.push(...supportItems(model, connected));
  if (layers.has('nodes') || layers.has('nodeLabels')) items.push(...nodeItems(model, connected, layers));
  if (layers.has('dimensions')) items.push(...dimensionItems(model, options, fmt));
  if (layers.has('loads')) items.push(...loadItems(model, frames, options, size, fmt));
  if (layers.has('reactions') && results) items.push(...reactionItems(model, results.reactions, options, size, fmt));

  return items;
};
