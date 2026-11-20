/**
 * The drawing of a whole structure as scene items, in the hand of the EduBeam website's figures
 * (HeroFigure, BuildSteps): ink members with round caps, outlined supports, orange loads, purple
 * reactions clear of the supports, diagrams as an outline with ordinates across the member, and
 * numbers where a reader looks for them - member ends, steps, extremes and corners.
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
  textWidth,
} from './scene';
import {
  glyphReach,
  groundDirection,
  memberDirections,
  supportGlyph,
  supportPlacement,
  type GlyphPart,
} from './supports';
import { formatNumber, formatQuantity, type Unit, type Units } from './units';

/** What the caller switches on and off. Results are named by their symbol. */
export type PlotLayer =
  | 'nodes'
  | 'nodeLabels'
  | 'memberLabels'
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
  'memberLabels',
];

export interface TemperatureSymbols {
  /** The uniform change, along the axis */
  readonly uniform: string;
  /** The difference across the depth, bottom minus top */
  readonly gradient: string;
}

export const DEFAULT_TEMPERATURE_SYMBOLS: TemperatureSymbols = { uniform: 'ΔT', gradient: 'ΔTb − ΔTt' };

export const RESULT_LAYERS = ['N', 'V', 'M', 'w'] as const satisfies readonly PlotLayer[];
export type ResultLayer = (typeof RESULT_LAYERS)[number];

export interface StructureSceneOptions {
  /** Layers to build. Build every layer that may be shown, so the layout never moves. */
  readonly layers: ReadonlySet<PlotLayer>;
  /** Thumbnail drawing: smaller symbols, at most two values per member, magnitudes only. */
  readonly compact: boolean;
  /**
   * Sizes in place of the preset's (full or compact), px: an editor draws its members lighter, its
   * arrows shorter and alike for loads and reactions, its moments as a nearly closed ring.
   */
  readonly sizes?: Partial<SymbolSizes>;
  /**
   * How loads are written. `figure` (the default): with their units, a uniform load once as
   * `q = …`. `ends`: as an editor annotates them, bare numbers (its units shown elsewhere), and a
   * distributed load at both its ends, zero included, as students are taught to write it.
   */
  readonly loadLabels?: 'figure' | 'ends';
  /**
   * A diagram constant along its member: its value `once`, mid-member (the default), or at both
   * `ends`, as students are taught to annotate every segment.
   */
  readonly constantDiagrams?: 'once' | 'ends';
  /**
   * A moment the same round a rigid corner: written `once` (the default), at the member with the
   * most room, or at `each` member's end, as students annotate every member.
   */
  readonly cornerValues?: 'once' | 'each';
  /** Labels keep off the support symbols too, not only the members and arrows. */
  readonly labelsAvoidSupports?: boolean;
  /**
   * Nodes no member reaches are drawn too, with their names and supports: an editor's nodes, placed
   * before they are connected. By default a figure leaves them out.
   */
  readonly freeNodes?: boolean;
  /**
   * A distributed load with both components drawn as the two loads it was entered as (along and
   * across the member for a local load, x and z for a global one), each with its own value, rather
   * than as their resultant.
   */
  readonly splitLoads?: boolean;
  /**
   * Values of different diagrams on one ordinate line, written along it, stand side by side there,
   * each half a line aside, rather than one pushed further out (see `sideBySide`).
   */
  readonly sideBySide?: boolean;
  readonly units: Units;
  readonly numberFormat?: Intl.NumberFormat;
  /**
   * Writes a displacement, given in display units. Displacements are orders of magnitude smaller
   * than the forces, so an editor writes them its own way (a power of ten where `numberFormat`'s
   * fixed decimals would round a deflection to zero).
   */
  readonly displacementText?: (value: number) => string;
  /** The temperature load's symbols, which apps write differently: the Czech EduBeam has ΔTs and ΔTd − ΔTh. */
  readonly temperatureSymbols?: TemperatureSymbols;
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
  /** Positive N on the member's dashed side (local +z); off (the default), on the other. */
  readonly normalOnDashedSide?: boolean;
  /** Positive V on the member's dashed side (local +z); off (the default), on the other. */
  readonly shearOnDashedSide?: boolean;
  /**
   * How a diagram's area is drawn: `hatch` (the default), lines across the member as drawn by
   * hand; `solid`, a light tint; `none`, the outline alone.
   */
  readonly diagramFill?: 'hatch' | 'solid' | 'none';
  /** Write each piece's polynomial degree inside the diagram: 0°, 1°, 2°, 3°. */
  readonly showDegrees?: boolean;
  /** Support symbols' size, as a multiple of the preset's (the editor's support size setting). */
  readonly supportScale?: number;
  /** The plot's font size, px: labels in a tight spot may step down from it to 10 px. */
  readonly fontSize?: number;
  /** Values upright (`horizontal`) or turned to run along their ordinate (`axis`), as in the app. */
  readonly resultLabelMode?: ResultLabelMode;
  /**
   * `values` (the default) draws each reaction the way it acts, with its size. `names` draws the
   * unknowns of an exercise instead: an arrow for every restrained direction, pointing the way it
   * counts as positive (along the node's x, up, counter-clockwise), named `A` with subscript `x`,
   * `z`, or `M` with subscript `A`. It needs no results.
   */
  readonly reactionLabels?: ReactionLabels;
}

export type ResultLabelMode = 'axis' | 'horizontal';
export type ReactionLabels = 'values' | 'names';

/** Ordinates are this far apart on screen, as in the app and the website's figures. */
export const HATCH_SPACING_PX = 7;

/**
 * The most arrows or hatch lines one member gets, however long it is drawn: spaced in px, their
 * number grows with the zoom, and a member drawn millions of px long (a fit's first probe) would
 * get millions. Far more than a screen shows; a longer member spaces them wider.
 */
const MAX_REPEATS = 500;

/** Symbol sizes in px: the website's figures, and a smaller set for thumbnails. */
const SIZES = {
  full: {
    member: 3.5,
    /** A hinge's circle, radius: its own size, so a lighter member keeps a readable hinge */
    hinge: 4.5,
    /** A moment load's arc: how far round it runs, its weight and its head */
    arcSweep: 270,
    arcWidth: 1.75,
    arcHead: 8,
    arcHeadHalf: 3.5,
    pointShaft: 3,
    pointHead: 12,
    pointHeadWidth: 14,
    pointArrow: 52,
    udlArrow: 32,
    udlSpacing: 18,
    reaction: 46,
    reactionShaft: 1.75,
    reactionHead: 9,
    reactionHeadWidth: 9,
    reactionGap: 11,
    /** A reaction's arrow clear of a moment's ring round the same node */
    reactionArcGap: 8,
    /** A node's label from the node, and from it when a moment's ring surrounds it */
    nodeLabelGap: 9,
    arcLabelGap: 24,
    arcLabelFirst: 24,
    arc: 15,
    reactionArc: 20,
    /** A moment reaction's arc: a half circle on the support's side, clear of the diagrams */
    reactionArcSweep: 190,
    deformed: 2.25,
  },
  compact: {
    member: 2.75,
    hinge: 3.75,
    arcSweep: 270,
    arcWidth: 1.75,
    arcHead: 8,
    arcHeadHalf: 3.5,
    pointShaft: 2.25,
    pointHead: 9,
    pointHeadWidth: 10,
    pointArrow: 34,
    udlArrow: 22,
    udlSpacing: 14,
    reaction: 32,
    reactionShaft: 1.75,
    reactionHead: 9,
    reactionHeadWidth: 9,
    reactionGap: 8,
    reactionArcGap: 8,
    nodeLabelGap: 9,
    arcLabelGap: 24,
    arcLabelFirst: 24,
    arc: 11,
    reactionArc: 15,
    reactionArcSweep: 190,
    deformed: 1.75,
  },
} as const;

/** Every symbol's size, px: line weights, arrow lengths and heads, arcs. */
export type SymbolSizes = { readonly [K in keyof (typeof SIZES)['full']]: number };
type Sizes = SymbolSizes;

const DIAGRAM_TONE: Record<InternalForce, Tone> = { N: 'normal', V: 'shear', M: 'moment' };

/* ── What an item draws ─────────────────────────────────────────────────────────────────────── */

const memberEntity = (id: string): string => `member:${id}`;
const nodeEntity = (id: string): string => `node:${id}`;
/** The items marked as drawing `entity`. */
const tagged = (items: readonly SceneItem[], entity: string | undefined): SceneItem[] =>
  entity === undefined ? [...items] : items.map((item) => ({ ...item, entity }));
/** Marks the items pushed since `start`. */
const tagFrom = (items: SceneItem[], start: number, entity: string | undefined): void => {
  if (entity === undefined) return;
  for (let i = start; i < items.length; i++) items[i] = { ...items[i], entity };
};

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
      // The head is as much in the way of a label as the shaft
      obstacle: style.obstacle,
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
  sweep = 270,
  look: { readonly width: number; readonly head: number; readonly headHalf: number } = {
    width: 1.75,
    head: 8,
    headHalf: 3.5,
  }
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
  const { head, headHalf } = look;
  const base = { x: end.x - tangent.x * head * 0.6, y: end.y - tangent.y * head * 0.6 };
  const tip = { x: base.x + tangent.x * head, y: base.y + tangent.y * head };
  return [
    {
      kind: 'path',
      group,
      layer,
      tone,
      width: look.width,
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

/** The dashed line beside a member that marks its bottom fibres, the local +z side, as in the app. */
const FIBRE_WIDTH = 1;
const FIBRE_DASH = '5 4';
const FIBRE_GAP = 2.5;

const memberItems = (model: PlotModel, frames: ReadonlyMap<string, MemberFrame>, size: Sizes): SceneItem[] =>
  model.members.flatMap((m, i): SceneItem[] => {
    const f = frameOf(frames, m.id);
    // Just clear of the member's stroke, on screen px: the same at every zoom, like the app's
    const off = size.member / 2 + FIBRE_GAP;
    return tagged(
      [
        {
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
        },
        {
          kind: 'path',
          group: 'members',
          layer: LAYERS.member,
          tone: 'muted',
          width: FIBRE_WIDTH,
          dash: FIBRE_DASH,
          cap: 'butt',
          fitIgnore: true,
          segments: [
            { op: 'M', p: at(f, 0, f.nx * off, f.nz * off) },
            { op: 'L', p: at(f, f.length, f.nx * off, f.nz * off) },
          ],
        },
      ],
      memberEntity(m.id)
    );
  });

/**
 * A joint where every member but at most one is released is a hinge in the node: one circle
 * there. Elsewhere a released end gets its own circle just inside its member.
 */
const hingeItems = (model: PlotModel, frames: ReadonlyMap<string, MemberFrame>, size: Sizes): SceneItem[] => {
  const items: SceneItem[] = [];
  const r = size.hinge;
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
      items.push({ ...circle(anchor(node.x, node.z)), entity: nodeEntity(node.id) });
      continue;
    }
    for (const { m, end } of released) {
      const f = frameOf(frames, m.id);
      const sign = end === 0 ? 1 : -1;
      const off = r * 2 + 1;
      items.push({
        ...circle(at(f, end === 0 ? 0 : f.length, sign * f.tx * off, sign * f.tz * off)),
        entity: memberEntity(m.id),
      });
    }
  }
  return items;
};

/**
 * A support's line widths on screen, px: the EduBeam app's, the same at every size and on every
 * figure, so a support looks alike in the app, on a page and in a thumbnail.
 */
const SUPPORT_WIDTH = { regular: 1.8, bold: 2.4, thin: 1.2 } as const satisfies Record<GlyphPart['weight'], number>;

const supportItems = (model: PlotModel, connected: ReadonlySet<string>, obstacle = false, scale = 1): SceneItem[] => {
  const items: SceneItem[] = [];
  for (const node of model.nodes) {
    if (!connected.has(node.id)) continue;
    const placement = supportPlacement(model, node);
    const r = (placement.rotation * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    for (const part of supportGlyph(placement.kind)) {
      const pts = part.points.map(([x, y]) => anchor(node.x, node.z, scale * (x * c - y * s), scale * (x * s + y * c)));
      items.push({
        kind: 'path',
        group: 'supports',
        layer: LAYERS.support,
        tone: 'ink',
        width: SUPPORT_WIDTH[part.weight],
        fill: part.fill,
        cap: 'round',
        obstacle,
        entity: nodeEntity(node.id),
        segments: [
          ...pts.map((p, i): Segment => ({ op: i === 0 ? 'M' : 'L', p })),
          ...(part.closed ? [{ op: 'Z' } as const] : []),
        ],
      });
    }
  }
  return items;
};

const nodeItems = (
  model: PlotModel,
  connected: ReadonlySet<string>,
  layers: ReadonlySet<PlotLayer>,
  size: Sizes
): SceneItem[] => {
  const items: SceneItem[] = [];
  for (const node of model.nodes) {
    if (!connected.has(node.id)) continue;
    if (layers.has('nodes')) {
      items.push({
        kind: 'circle',
        group: 'nodes',
        layer: LAYERS.hinge,
        at: anchor(node.x, node.z),
        entity: nodeEntity(node.id),
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
      // Every free direction close in, then the same again further out, clear of an arc round the node
      const dirs = rankedDirections(used, { x: -0.7, y: -0.7 });
      // A moment arc round the node (a fixing moment, a nodal moment) would enclose a label close in
      const arcs = node.fixity.ry || model.loads.some((l) => l.kind === 'nodalMoment' && l.node === node.id);
      // Round a moment's ring: from `arcLabelFirst`, which may be close in - the ring is in the way
      // only where it runs, so the label can sit in its opening, next to the node - then round it
      const rings = arcs
        ? [...new Set([size.arcLabelFirst, size.arcLabelGap, size.arcLabelGap + 8])]
        : [size.nodeLabelGap, size.nodeLabelGap + 13];
      const [first, ...rest] = rings.flatMap((gap) => dirs.map((dir) => placeText(anchor(node.x, node.z), dir, gap)));
      items.push({
        kind: 'text',
        group: 'nodeLabels',
        entity: nodeEntity(node.id),
        layer: LAYERS.label,
        text: node.id,
        tone: 'ink',
        priority: 9,
        weight: 600,
        ...first,
        alternatives: rest,
      });
    }
  }
  return items;
};

/** Overall width under the structure and height to its right, as BuildSteps draws them. */
/** Distinct values, sorted: positions closer than a micrometre are one. */
const distinct = (values: readonly number[]): number[] =>
  [...values].sort((a, b) => a - b).filter((v, i, all) => i === 0 || v - all[i - 1] > 1e-6);

/** A dimension is part of the question: without it an exercise cannot be solved, so it is never left out */
const DIMENSION_PRIORITY = 11;

/**
 * Chain dimensions, as an exercise sheet gives them: below the structure, one per span between the
 * nodes and point loads along x; to its right, one per storey between the node levels. With more
 * than one link, the overall size follows on a second line.
 */
const dimensionItems = (
  model: PlotModel,
  frames: ReadonlyMap<string, MemberFrame>,
  options: StructureSceneOptions,
  fmt: (v: number, u: Unit) => string
): SceneItem[] => {
  const loadXs = model.loads.flatMap((l) => {
    if (l.kind !== 'pointForce' && l.kind !== 'pointMoment') return [];
    const f = frames.get(l.member);
    return f ? [pointAlong(f, l.at).x] : [];
  });
  const xs = distinct([...model.nodes.map((n) => n.x), ...loadXs]);
  const zs = distinct(model.nodes.map((n) => n.z));
  const [x0, x1, z0, z1] = [xs[0], xs[xs.length - 1], zs[0], zs[zs.length - 1]];
  const items: SceneItem[] = [];
  const line = (a: Anchor, b: Anchor): ScenePath => ({
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
  const length = (v: number) => fmt(v, options.units.length);
  // Clear of the reactions when both are in the layout; a second line 28 px further out.
  const below = options.layers.has('reactions') ? 92 : 52;
  const right = options.layers.has('reactions') ? 104 : 58;
  const ROW = 28;

  // The oblique stroke of a technical drawing where each extension line crosses the dimension line
  const TICK = 4;
  const tick = (a: Anchor): ScenePath => ({
    ...line(shift(a, -TICK, TICK), shift(a, TICK, -TICK)),
    width: 1.5,
  });

  const horizontal = (stops: readonly number[], dy: number) => {
    items.push(line(anchor(stops[0], z1, 0, dy), anchor(stops[stops.length - 1], z1, 0, dy)));
    for (const x of stops)
      items.push(line(anchor(x, z1, 0, dy - 6), anchor(x, z1, 0, dy + 6)), tick(anchor(x, z1, 0, dy)));
    stops.slice(1).forEach((x, i) => {
      const a = stops[i];
      items.push(
        text(
          'dimensions',
          anchor((a + x) / 2, z1, 0, dy),
          { x: 0, y: -1 },
          4,
          length(x - a),
          'muted',
          DIMENSION_PRIORITY
        )
      );
    });
  };
  const vertical = (stops: readonly number[], dx: number) => {
    items.push(line(anchor(x1, stops[0], dx, 0), anchor(x1, stops[stops.length - 1], dx, 0)));
    for (const z of stops)
      items.push(line(anchor(x1, z, dx - 6, 0), anchor(x1, z, dx + 6, 0)), tick(anchor(x1, z, dx, 0)));
    stops.slice(1).forEach((z, i) => {
      const a = stops[i];
      items.push(
        text(
          'dimensions',
          anchor(x1, (a + z) / 2, dx, 0),
          { x: 1, y: 0 },
          6,
          length(z - a),
          'muted',
          DIMENSION_PRIORITY
        )
      );
    });
  };

  if (x1 - x0 > 1e-9) {
    horizontal(xs, below);
    if (xs.length > 2) horizontal([x0, x1], below + ROW);
  }
  if (z1 - z0 > 1e-9) {
    vertical(zs, right);
    if (zs.length > 2) vertical([z0, z1], right + 2 * ROW);
  }
  return items;
};

/* ── Loads ──────────────────────────────────────────────────────────────────────────────── */

/** A member-local or global (fx, fz) as a screen vector. */
const toScreen = (f: MemberFrame, fx: number, fz: number, local: boolean): Vec =>
  local ? { x: fx * f.tx + fz * f.nx, y: fx * f.tz + fz * f.nz } : { x: fx, y: fz };

const LOAD_PRIORITY = 5;

/** A distributed load's direction on screen (that of its larger end), and whether it runs along the member. */
const distributedDirection = (
  load: Extract<PlotLoad, { kind: 'distributed' }>,
  f: MemberFrame
): { d: Vec; along: boolean } | null => {
  const q0 = toScreen(f, load.start.fx, load.start.fz, load.local);
  const q1 = toScreen(f, load.end.fx, load.end.fz, load.local);
  const m0 = Math.hypot(q0.x, q0.y);
  const m1 = Math.hypot(q1.x, q1.y);
  if (m0 === 0 && m1 === 0) return null;
  const d = m1 > m0 ? unit(q1.x, q1.y) : unit(q0.x, q0.y);
  return { d, along: Math.abs(d.x * f.tz - d.y * f.tx) < 0.1 };
};

const distributedItems = (
  load: Extract<PlotLoad, { kind: 'distributed' }>,
  f: MemberFrame,
  options: StructureSceneOptions,
  size: Sizes,
  fmt: (v: number, u: Unit) => string,
  labelled = true,
  /** How far out from the member this band starts, px: on top of the loads stacked before it */
  offset = 0,
  /** For a load along the member: the side of it its arrows run on, 1 for the member's +z */
  alongSide: 1 | -1 = -1
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
  const atEnds = options.loadLabels === 'ends';
  const value = (v: number) =>
    options.compact || !uniform || atEnds
      ? fmt(Math.abs(v), options.units.distributed)
      : `q = ${fmt(Math.abs(v), options.units.distributed)}`;

  if (Math.abs(d.x * f.tz - d.y * f.tx) < 0.1) {
    if (atEnds) {
      // A band beside the member, as the editor draws it: its outline as high as the value, short
      // arrows inside it pointing along the member, its values at the band's ends
      const n = { x: alongSide * f.nx, y: alongSide * f.nz };
      const base = size.member / 2 + 4 + offset;
      const BAND = 20;
      const heightAt = (v: number) => (BAND * Math.abs(v)) / vmax;
      const edge = (x: number, h: number) => at(f, x, n.x * (base + h), n.y * (base + h));
      const h0 = heightAt(v0);
      const h1 = heightAt(v1);
      items.push({
        kind: 'path',
        group: 'loads',
        layer: LAYERS.load,
        tone: 'load',
        width: 1.25,
        obstacle: true,
        segments: [
          { op: 'M', p: edge(0, 0) },
          { op: 'L', p: edge(0, h0) },
          { op: 'L', p: edge(f.length, h1) },
          { op: 'L', p: edge(f.length, 0) },
          { op: 'Z' },
        ],
      });
      items.push({
        kind: 'path',
        group: 'loads',
        layer: LAYERS.load,
        tone: 'load',
        width: 0,
        fill: 'tone',
        hitArea: true,
        fitIgnore: true,
        segments: [
          { op: 'M', p: edge(0, 0) },
          { op: 'L', p: edge(0, Math.max(h0, 8)) },
          { op: 'L', p: edge(f.length, Math.max(h1, 8)) },
          { op: 'L', p: edge(f.length, 0) },
          { op: 'Z' },
        ],
      });
      const step = Math.max(1, Math.round(lengthPx / 30));
      for (let i = 0; i < step; i++) {
        const x = ((i + 0.5) * f.length) / step;
        const v = v0 + ((v1 - v0) * x) / f.length;
        const h = heightAt(v);
        if (h < 6) continue;
        const s = Math.sign(v);
        const mid = { x: n.x * (base + h / 2), y: n.y * (base + h / 2) };
        items.push(
          ...arrow(
            'loads',
            at(f, x),
            { x: mid.x - s * d.x * 8, y: mid.y - s * d.y * 8 },
            { x: mid.x + s * d.x * 8, y: mid.y + s * d.y * 8 },
            'load',
            LAYERS.load,
            thin
          )
        );
      }
      // Each end's value just past the band's end, along the member; when that is taken, beside the
      // band's end, out from the member, or inside the band at its end
      const t = { x: f.tx, y: f.tz };
      const ends = uniform
        ? ([[f.length, v1, h1, t]] as const)
        : ([
            [0, v0, h0, { x: -t.x, y: -t.y }],
            [f.length, v1, h1, t],
          ] as const);
      for (const [x, v, h, dir] of ends) {
        const middle = at(f, x, n.x * (base + Math.max(h, 8) / 2), n.y * (base + Math.max(h, 8) / 2));
        const [first, ...rest] = [
          placeText(middle, dir, 4),
          placeText(edge(x, h), n, 4),
          placeText(middle, { x: -dir.x, y: -dir.y }, -2),
        ];
        items.push({
          kind: 'text',
          group: 'loads',
          layer: LAYERS.label,
          text: value(v),
          tone: 'load',
          priority: LOAD_PRIORITY,
          ...first,
          alternatives: rest,
        });
      }
      return items;
    }
    // Along the member: short arrows on a line beside it.
    const off = { x: alongSide * f.nx * (10 + offset), y: alongSide * f.nz * (10 + offset) };
    const count = Math.min(MAX_REPEATS, Math.max(1, Math.round(lengthPx / 30)));
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
      text(
        'loads',
        at(f, f.length / 2, off.x, off.y),
        unit(alongSide * f.nx, alongSide * f.nz),
        8,
        value(vmax),
        'load',
        LOAD_PRIORITY
      )
    );
    return items;
  }

  // Arrow tips stop short of the member's stroke, as in the website's figures; a band stacked on
  // another rests on its top line.
  const tipGap = offset > 0 ? offset + 1.5 : size.member / 2 + 2;
  const lengthAt = (v: number) => (size.udlArrow * v) / vmax;
  const count = Math.min(MAX_REPEATS, Math.max(2, Math.round(lengthPx / size.udlSpacing)));
  for (let i = 0; i <= count; i++) {
    const x = (i * f.length) / count;
    const v = v0 + ((v1 - v0) * i) / count;
    const len = lengthAt(v);
    if (Math.abs(len) < size.member / 2 + 8) continue;
    const s = Math.sign(len);
    items.push(
      ...arrow(
        'loads',
        at(f, x),
        { x: -d.x * (offset + len), y: -d.y * (offset + len) },
        { x: -d.x * s * tipGap, y: -d.y * s * tipGap },
        'load',
        LAYERS.load,
        thin
      )
    );
  }
  const tail = (x: number, v: number) => at(f, x, -d.x * (offset + lengthAt(v)), -d.y * (offset + lengthAt(v)));
  // The whole band, to point at: from where its arrows land to its top line
  const foot = (x: number) => at(f, x, -d.x * offset, -d.y * offset);
  items.push({
    kind: 'path',
    group: 'loads',
    layer: LAYERS.load,
    tone: 'load',
    width: 0,
    fill: 'tone',
    hitArea: true,
    fitIgnore: true,
    segments: [
      { op: 'M', p: foot(0) },
      { op: 'L', p: tail(0, v0) },
      { op: 'L', p: tail(f.length, v1) },
      { op: 'L', p: foot(f.length) },
      { op: 'Z' },
    ],
  });
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
  const ends =
    uniform && !atEnds
      ? ([[0, v0, forwardStart]] as const)
      : ([
          [0, v0, forwardStart],
          [f.length, v1, forwardEnd],
        ] as const);
  const over = (x: number, v: number, align: TextAlign, gap = 6) => {
    const placed = placeText(tail(x, v), Math.sign(v) >= 0 ? out : { x: -out.x, y: -out.y }, gap);
    return { ...placed, align: placed.baseline === 'middle' ? placed.align : align };
  };
  for (const [x, v, inward] of labelled ? ends : []) {
    // A zero end is written too when every end is
    if (Math.abs(v) < 1e-9 * vmax && !atEnds) continue;
    // Over the end of the band, reading inward (BuildSteps writes q over the beam's left end); a
    // uniform load may move to the middle or the other end when a diagram stands there.
    // An editor writes each end's value just outside the band, beside its top line (the start's
    // before the band, the end's past it), so stacked bands read as a column of values; over the
    // band's end when that is taken
    const outward = x === 0 ? { x: -f.tx, y: -f.tz } : { x: f.tx, y: f.tz };
    const outside = placeText(tail(x, v), outward, 4);
    items.push({
      kind: 'text',
      group: 'loads',
      layer: LAYERS.label,
      text: value(v),
      tone: 'load',
      priority: LOAD_PRIORITY,
      ...(atEnds ? outside : over(x, v, inward)),
      // On an inclined member the band runs up or down beside the text: either alignment at either end
      alternatives:
        uniform && !atEnds
          ? [
              over(f.length / 2, v, 'middle'),
              over(f.length, v, forwardEnd),
              over(0, v, forwardEnd),
              over(f.length, v, forwardStart),
            ]
          : atEnds
            ? [
                // Over the end, then the corner above it outside, then a little in along the band:
                // always by the end it belongs to
                over(x, v, inward),
                placeText(
                  tail(x, v),
                  unit(
                    outward.x + (Math.sign(v) >= 0 ? out : { x: -out.x, y: -out.y }).x,
                    outward.y + (Math.sign(v) >= 0 ? out : { x: -out.x, y: -out.y }).y
                  ),
                  4
                ),
                over(x, v, inward, 16),
                over(x === 0 ? 0.08 * f.length : 0.92 * f.length, v0 + (v1 - v0) * (x === 0 ? 0.08 : 0.92), inward),
                over(x === 0 ? 0.16 * f.length : 0.84 * f.length, v0 + (v1 - v0) * (x === 0 ? 0.16 : 0.84), inward),
              ]
            : // Further out over the same end when crowded: never along the member, away from it
              [over(x, v, inward, 16), over(x, v, inward, 28)],
    });
  }
  return items;
};

const pointForceItems = (
  origin: Anchor,
  force: Vec,
  content: string,
  size: Sizes,
  gap: number,
  pull = false,
  bold = true
): SceneItem[] => {
  const d = unit(force.x, force.y);
  // Pushing: the arrow comes in towards the point. Pulling: it hangs off the point, pointing away.
  const near = pull ? gap : -gap;
  const far = pull ? gap + size.pointArrow : -(gap + size.pointArrow);
  const [tip, tail] = pull
    ? [
        { x: d.x * far, y: d.y * far },
        { x: d.x * near, y: d.y * near },
      ]
    : [
        { x: d.x * near, y: d.y * near },
        { x: d.x * far, y: d.y * far },
      ];
  const end = pull ? tip : tail;
  return [
    ...arrow('loads', origin, tail, tip, 'load', LAYERS.load, {
      width: size.pointShaft,
      head: size.pointHead,
      headWidth: size.pointHeadWidth,
      obstacle: true,
    }),
    {
      ...text('loads', shift(origin, end.x, end.y), pull ? d : { x: -d.x, y: -d.y }, 5, content, 'load', LOAD_PRIORITY),
      weight: bold ? 600 : undefined,
    },
  ];
};

/** Whether a member leaves the node along `dir`, where an arrow drawn that way would lie on it. */
const memberAlong = (model: PlotModel, frames: ReadonlyMap<string, MemberFrame>, node: PlotNode, dir: Vec): boolean =>
  model.members.some((m) => {
    if (m.start !== node.id && m.end !== node.id) return false;
    const f = frames.get(m.id);
    if (!f) return false;
    const sign = m.start === node.id ? 1 : -1;
    return sign * (f.tx * dir.x + f.tz * dir.y) > 0.97;
  });

const pointMomentItems = (
  origin: Anchor,
  my: number,
  gap: Vec,
  content: string,
  size: Sizes,
  avoid: readonly Vec[] = []
): SceneItem[] => {
  // Off the arc, the freest direction first; the others in reserve for when a label stands there
  const [first, ...rest] = rankedDirections([gap, ...avoid], { x: 0.7, y: -0.7 }).map((dir) =>
    placeText(shift(origin, dir.x * size.arc, dir.y * size.arc), dir, 4)
  );
  return [
    ...momentArc('loads', origin, size.arc, my > 0, gap, 'load', LAYERS.load, undefined, size.arcSweep, {
      width: size.arcWidth,
      head: size.arcHead,
      headHalf: size.arcHeadHalf,
    }),
    {
      kind: 'text',
      group: 'loads',
      layer: LAYERS.label,
      text: content,
      tone: 'load',
      priority: LOAD_PRIORITY,
      ...first,
      alternatives: rest,
    },
  ];
};

const temperatureItems = (
  load: Extract<PlotLoad, { kind: 'temperature' }>,
  f: MemberFrame,
  units: Units,
  fmt: (v: number, u: Unit) => string,
  symbols: TemperatureSymbols
): SceneItem[] => {
  const parts: string[] = [];
  if (load.uniform !== 0) parts.push(`${symbols.uniform} = ${fmt(load.uniform, units.temperature)}`);
  if (load.gradient !== 0) parts.push(`${symbols.gradient} = ${fmt(load.gradient, units.temperature)}`);
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
      {
        ...text(
          'loads',
          shift(origin, tip.x, tip.y),
          d,
          4,
          fmt(Math.hypot(dx, dz), units.displacement),
          'load',
          LOAD_PRIORITY
        ),
        // Past the arrow's head, else beside its middle on the side away from the node, else at its tail
        alternatives: [
          placeText(shift(origin, o.x + d.x * 4, o.y + d.y * 4), { x: perp.x * side, y: perp.y * side }, 6),
          placeText(shift(origin, o.x - d.x * 12, o.y - d.y * 12), { x: -d.x, y: -d.y }, 4),
        ],
      }
    );
  }
  if (load.ry) {
    const gap = { x: -away.x, y: -away.y };
    items.push(...momentArc('loads', origin, size.arc + 6, load.ry > 0, gap, 'load', LAYERS.load, '4 3'));
    const r = size.arc + 6;
    const [first, ...rest] = rankedDirections([gap], { x: 0.7, y: -0.7 }).map((dir) =>
      placeText(shift(origin, dir.x * r, dir.y * r), dir, 4)
    );
    items.push({
      kind: 'text',
      group: 'loads',
      layer: LAYERS.label,
      text: fmt(Math.abs(load.ry), units.rotation),
      tone: 'load',
      priority: LOAD_PRIORITY,
      ...first,
      alternatives: rest,
    });
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

/** A distributed load with both components, as its two components: each a load of its own. */
const splitComponents = (load: PlotLoad): PlotLoad[] => {
  if (load.kind !== 'distributed') return [load];
  const { start, end } = load;
  const hasX = start.fx !== 0 || end.fx !== 0;
  const hasZ = start.fz !== 0 || end.fz !== 0;
  if (!hasX || !hasZ) return [load];
  return [
    { ...load, start: { fx: 0, fz: start.fz }, end: { fx: 0, fz: end.fz } },
    { ...load, start: { fx: start.fx, fz: 0 }, end: { fx: end.fx, fz: 0 } },
  ];
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
  /*
   * Loads of one member or node that push the same way are stacked, as a textbook draws them: a
   * band on top of the one before, a point load's arrow beyond the last one's value.
   */
  const stacks = new Map<string, { d: Vec; offset: number }[]>();
  const stackOn = (key: string, d: Vec, height: number): number => {
    const list = stacks.get(key) ?? [];
    const same = list.filter((e) => e.d.x * d.x + e.d.y * d.y > 0.95);
    const offset = same.reduce((sum, e) => sum + e.offset, 0);
    list.push({ d, offset: height });
    stacks.set(key, list);
    return offset;
  };
  const pointStep = size.pointArrow + (options.fontSize ?? 13) + 10;
  const loads = options.splitLoads ? model.loads.flatMap(splitComponents) : model.loads;
  for (const load of loads) {
    const start = items.length;
    switch (load.kind) {
      case 'nodalForce': {
        const node = nodes.get(load.node);
        if (node) {
          const content = fmt(Math.hypot(load.fx, load.fz), units.force);
          // A load at a truss's bottom chord pushes down along the vertical above it: hang it below instead
          const d = unit(load.fx, load.fz);
          const pull = memberAlong(model, frames, node, { x: -d.x, y: -d.y }) && !memberAlong(model, frames, node, d);
          const along = stackOn(`node:${load.node}`, pull ? { x: -d.x, y: -d.y } : d, pointStep);
          items.push(
            ...pointForceItems(
              anchor(node.x, node.z),
              { x: load.fx, y: load.fz },
              content,
              size,
              gap + 1 + along,
              pull,
              options.loadLabels !== 'ends'
            )
          );
        }
        break;
      }
      case 'nodalMoment': {
        const node = nodes.get(load.node);
        if (node) {
          const away = awayFrom(model, node, { x: 0, y: 1 });
          const content = fmt(Math.abs(load.my), units.moment);
          // Clear of the members at the node, and of the node's own label diagonally up-left
          items.push(
            ...pointMomentItems(anchor(node.x, node.z), load.my, { x: -away.x, y: -away.y }, content, size, [
              { x: -0.7, y: -0.7 },
            ])
          );
        }
        break;
      }
      case 'distributed': {
        const f = frames.get(load.member);
        const dir = f ? distributedDirection(load, f) : null;
        if (f && dir) {
          // A load along the member takes the side its bands leave free (they stand on -z when they push +z)
          const banded = loads.some((other) => {
            if (other.kind !== 'distributed' || other.member !== load.member) return false;
            const o = distributedDirection(other, f);
            return o !== null && !o.along && o.d.x * f.nx + o.d.y * f.nz > 0;
          });
          const side: 1 | -1 = banded ? 1 : -1;
          const offset = dir.along
            ? // Lines of arrows along the member stack whichever way they point
              stackOn(`along:${load.member}`, { x: 1, y: 0 }, options.loadLabels === 'ends' ? 26 : 14)
            : // Bands on one side of the member stack, however their arrows slant
              stackOn(
                `member:${load.member}:${dir.d.x * f.nx + dir.d.y * f.nz > 0 ? 'z' : '-z'}`,
                { x: 1, y: 0 },
                size.udlArrow + 2
              );
          items.push(
            ...distributedItems(load, f, options, size, fmt, !continuesLoad(model, frames, load), offset, side)
          );
        }
        break;
      }
      case 'pointForce': {
        const f = frames.get(load.member);
        if (f) {
          const force = toScreen(f, load.fx, load.fz, load.local);
          const along = stackOn(`point:${load.member}:${load.at.toFixed(6)}`, unit(force.x, force.y), pointStep);
          items.push(
            ...pointForceItems(
              at(f, load.at),
              force,
              fmt(Math.hypot(load.fx, load.fz), units.force),
              size,
              gap + along,
              false,
              options.loadLabels !== 'ends'
            )
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
        if (f)
          items.push(
            ...temperatureItems(load, f, units, fmt, options.temperatureSymbols ?? DEFAULT_TEMPERATURE_SYMBOLS)
          );
        break;
      }
      case 'prescribed': {
        const node = nodes.get(load.node);
        if (node) items.push(...prescribedItems(load, node, awayFrom(model, node, { x: 1, y: 0 }), units, size, fmt));
        break;
      }
    }
    tagFrom(items, start, load.source);
  }
  return items;
};

/* ── Reactions ──────────────────────────────────────────────────────────────────────────────── */

const REACTION_PRIORITY = 5;
/** An exercise's unknowns before the node labels (9): a question with a name missing is unanswerable */
const NAME_PRIORITY = 10;

/**
 * Reactions as forces on the structure, clear of the support as BuildSteps draws them. One along
 * the support's ground direction stands beyond the symbol, pointing at it when it pushes; one
 * across it stands beside the symbol on the node's own line, pushing in from the side the force
 * comes from, or pulling out on the other side when a member is in the way. Each one aims at its node.
 */
/**
 * The reactions of an exercise, before it is solved: one for every restrained direction, with a
 * unit value pointing the way it counts as positive. Along the node's x to the right, along its z
 * upward (z points down, so −1), counter-clockwise for a fixing moment.
 */
const unknownReactions = (model: PlotModel): PlotReaction[] =>
  model.nodes.flatMap((n) => [
    ...(n.fixity.dx ? [{ node: n.id, dof: 'dx' as const, value: 1 }] : []),
    ...(n.fixity.dz ? [{ node: n.id, dof: 'dz' as const, value: -1 }] : []),
    ...(n.fixity.ry ? [{ node: n.id, dof: 'ry' as const, value: 1 }] : []),
  ]);

const reactionItems = (
  model: PlotModel,
  reactions: readonly PlotReaction[],
  options: StructureSceneOptions,
  size: Sizes
): SceneItem[] => {
  const items: SceneItem[] = [];
  const nodes = nodeMap(model);
  const byNode = new Map<string, PlotReaction[]>();
  for (const r of reactions) if (r.value !== 0) byNode.set(r.node, [...(byNode.get(r.node) ?? []), r]);
  const style = {
    width: size.reactionShaft,
    head: size.reactionHead,
    headWidth: size.reactionHeadWidth,
    obstacle: true,
  };
  const names = options.reactionLabels === 'names';
  const priority = names ? NAME_PRIORITY : REACTION_PRIORITY;
  // A result, so a bare number like the diagrams' values; only given quantities carry units. Or,
  // for an exercise, the unknown's name.
  // Names are variables, so italic, as a textbook sets them
  // Names are what the exercise asks for: a size up and semi-bold, so they read before the loads
  const nameStyle = { italic: true, weight: 600, size: Math.round((options.fontSize ?? 13) * 1.15) };
  const label = (r: PlotReaction): { text: string; sub?: string; italic?: boolean; weight?: number; size?: number } =>
    names
      ? r.dof === 'ry'
        ? { text: 'M', sub: r.node, ...nameStyle }
        : { text: r.node, sub: r.dof === 'dx' ? 'x' : 'z', ...nameStyle }
      : {
          text: formatNumber(
            Math.abs(r.value) * (r.dof === 'ry' ? options.units.moment : options.units.force).scale,
            options.numberFormat
          ),
        };

  for (const [id, list] of byNode) {
    const node = nodes.get(id);
    if (!node) continue;
    const start = items.length;
    const origin = anchor(node.x, node.z);
    const placement = supportPlacement(model, node);
    const ground = groundDirection(placement.rotation);
    const g = { x: ground.x, y: ground.z };
    // The glyph's own x axis: "across" the support.
    const across = { x: g.y, y: -g.x };
    const m = memberDirections(model, node);
    const used: Vec[] = Math.hypot(m.x, m.z) > 1e-9 ? [unit(m.x, m.z)] : [];
    // Each member's direction away from the node
    const members: Vec[] = model.members.flatMap((mm) => {
      const other = mm.start === id ? mm.end : mm.end === id ? mm.start : null;
      const o = other === null ? undefined : nodes.get(other);
      return o && Math.hypot(o.x - node.x, o.z - node.z) > 1e-12 ? [unit(o.x - node.x, o.z - node.z)] : [];
    });
    const moment = list.find((r) => r.dof === 'ry');
    const arcR = size.reactionArc;
    const supportScale = options.supportScale ?? 1;
    const reach = supportScale * glyphReach(placement.kind, placement.rotation, g.x, g.y);
    const clear = moment ? arcR + size.reactionArcGap : 0;

    for (const r of list) {
      if (r.dof === 'ry') continue;
      const c = Math.cos(node.angle);
      const s = Math.sin(node.angle);
      const axis = r.dof === 'dx' ? { x: c, y: s } : { x: -s, y: c };
      const f = { x: axis.x * r.value, y: axis.y * r.value };
      const fd = unit(f.x, f.y);
      const value = label(r);
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
          ...text('reactions', labelAt, side, 7, value.text, 'reaction', priority),
          ...value,
          alternatives: [placeText(labelAt, { x: -side.x, y: -side.y }, 7)],
        });
        used.push(g);
      } else {
        // On the node's own line of action, as every reaction: pushing in from the side the force
        // comes from, or pulling out on the other side when a member takes that one.
        const taken = (d: Vec) => members.some((u) => u.x * d.x + u.y * d.y > 0.9);
        const behind = { x: -fd.x, y: -fd.y };
        const pushes = !taken(behind) || taken(fd);
        const side = pushes ? behind : fd;
        const near = Math.max(
          supportScale * glyphReach(placement.kind, placement.rotation, side.x, side.y) + size.reactionGap,
          clear
        );
        const far = near + size.reaction;
        const pNear = { x: side.x * near, y: side.y * near };
        const pFar = { x: side.x * far, y: side.y * far };
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
        // The value past the tail, then beside the arrow's middle on either side
        const mid = shift(origin, (pNear.x + pFar.x) / 2, (pNear.y + pFar.y) / 2);
        const perp = { x: -side.y, y: side.x };
        items.push({
          ...text('reactions', shift(origin, pFar.x, pFar.y), side, 4, value.text, 'reaction', priority),
          ...value,
          alternatives: [placeText(mid, perp, 5), placeText(mid, { x: -perp.x, y: -perp.y }, 5)],
        });
        used.push(side);
      }
    }

    if (moment) {
      const gap = used[0] ?? { x: 0, y: -1 };
      // By default a half circle on the support's side only, as a fuller arc reaches round into the
      // diagrams that start at this node; an editor may draw its ring (`reactionArcSweep`).
      items.push(
        ...momentArc(
          'reactions',
          origin,
          arcR,
          moment.value > 0,
          gap,
          'reaction',
          LAYERS.reaction,
          undefined,
          size.reactionArcSweep,
          { width: size.arcWidth, head: size.arcHead, headHalf: size.arcHeadHalf }
        )
      );
      // Off the arc, in the first free direction that also keeps clear of the members at the node
      const along = memberDirections(model, node);
      // First choice: out beside the arc, away from a beam and its loads (left of a wall on the
      // left), the node's own label being above it; at a column's foot, up and to the right
      const beam = along.count > 0 && Math.abs(along.x) > Math.abs(along.z);
      // A name goes up and away (its horizontal arrow comes in beside the arc), ahead of the node's
      // own label, which then finds another place
      const preferred = beam ? (names ? unit(-along.x, -1) : unit(-along.x, -0.2)) : { x: 0.7, y: -0.7 };
      const ranked = rankedDirections(along.count > 0 ? [...used, unit(along.x, along.z)] : used, preferred);
      // Beside a wall the first choice is tried first, even when a reaction's arrow comes from that
      // side below it: the collision checks still move the label if it is taken
      const dirs = beam ? [preferred, ...ranked] : ranked;
      const [first, ...rest] = dirs.map((dir) => placeText(shift(origin, dir.x * arcR, dir.y * arcR), dir, 5));
      items.push({
        kind: 'text',
        group: 'reactions',
        layer: LAYERS.label,
        ...label(moment),
        tone: 'reaction',
        priority,
        ...first,
        alternatives: rest,
      });
    }
    tagFrom(items, start, nodeEntity(id));
  }
  return items;
};

/* ── Diagrams ───────────────────────────────────────────────────────────────────────────────── */

/** Which way a positive value is drawn, along the member's local z: +1 toward local +z. */
export const diagramSide = (
  q: InternalForce,
  momentOnTensionSide: boolean,
  dashed: { readonly normalOnDashedSide?: boolean; readonly shearOnDashedSide?: boolean } = {}
): 1 | -1 => {
  if (q === 'M') return momentOnTensionSide ? 1 : -1;
  return (q === 'N' ? dashed.normalOnDashedSide : dashed.shearOnDashedSide) ? 1 : -1;
};

const pieceSegments = (f: MemberFrame, piece: Piece, k: number, normal: Vec): Segment[] =>
  pieceToBeziers(piece).map(([, c1, c2, p]) => ({
    op: 'C' as const,
    c1: at(f, c1[0], normal.x * k * c1[1], normal.y * k * c1[1]),
    c2: at(f, c2[0], normal.x * k * c2[1], normal.y * k * c2[1]),
    p: at(f, p[0], normal.x * k * p[1], normal.y * k * p[1]),
  }));

/** The outline and the ordinates of one member's diagram. */
/**
 * Each piece's polynomial degree, 0° to 3°, written inside the diagram halfway out from the axis,
 * or just outside it where the diagram is too thin for the text, as a student marks a diagram.
 */
const degreeLabels = (
  q: InternalForce,
  f: MemberFrame,
  pw: Piecewise,
  k: number,
  normal: Vec,
  options: StructureSceneOptions
): SceneItem[] => {
  const fontSize = options.fontSize ?? 13;
  const largest = Math.max(0, ...pw.flatMap((p) => p.c.map(Math.abs)));
  if (!(largest > 0)) return [];
  return pw.flatMap((piece): SceneItem[] => {
    // The highest power that is more than round-off (the coefficients are per unit of s in [0, 1])
    let degree = -1;
    for (let i = piece.c.length - 1; i >= 0; i--) {
      if (Math.abs(piece.c[i]) > 1e-6 * largest) {
        degree = i;
        break;
      }
    }
    if (degree < 0 || (piece.x1 - piece.x0) * options.scale < fontSize * 1.5) return [];
    // A degree belongs to the whole piece, not a point: when another diagram's mark stands at the
    // middle, it slides along the piece
    const places = [0.5, 0.35, 0.65, 0.25, 0.75].map((t): TextPlacement => {
      const x = piece.x0 + t * (piece.x1 - piece.x0);
      const v = evalPiece(piece, x);
      const reach = Math.abs(v * k);
      const out = Math.sign(v) || 1;
      const fromAxis = reach >= 2 * fontSize ? (v * k) / 2 : v * k + out * fontSize * 0.9;
      return { at: at(f, x, normal.x * fromAxis, normal.y * fromAxis), align: 'middle', baseline: 'middle' };
    });
    const [first, ...rest] = places;
    return [
      {
        kind: 'text',
        group: q,
        layer: LAYERS.label,
        text: `${degree}°`,
        tone: DIAGRAM_TONE[q],
        priority: 4,
        ...first,
        alternatives: rest,
      },
    ];
  });
};

const diagramShape = (
  group: PlotLayer,
  f: MemberFrame,
  pw: Piecewise,
  tone: Tone,
  k: number,
  normal: Vec,
  scale: number,
  closed: readonly [boolean, boolean],
  fill: 'hatch' | 'solid' | 'none' = 'hatch'
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

  const items: SceneItem[] = [
    { kind: 'path', group, layer: LAYERS.diagramLine, tone, width: 1.75, segments: outline, shield: true },
  ];
  if (fill === 'none') return items;
  if (fill === 'solid') {
    // The area between the axis and the outline, closed to the axis at both ends whatever the outline does
    const area: Segment[] = [{ op: 'M', p: at(f, 0) }];
    pw.forEach((piece) => {
      const v0 = evalPiece(piece, piece.x0);
      area.push({ op: 'L', p: at(f, piece.x0, normal.x * k * v0, normal.y * k * v0) });
      area.push(...pieceSegments(f, piece, k, normal));
    });
    area.push({ op: 'L', p: at(f, f.length) }, { op: 'Z' });
    items.push({
      kind: 'path',
      group,
      layer: LAYERS.diagramFill,
      tone,
      width: 0,
      fill: 'tone',
      fillOpacity: 0.12,
      fitIgnore: true,
      segments: area,
    });
    return items;
  }

  const lengthPx = f.length * scale;
  const spacing = Math.max(HATCH_SPACING_PX, lengthPx / MAX_REPEATS);
  const count = Math.floor(lengthPx / spacing);
  const startPx = (lengthPx - count * spacing) / 2;
  const hatch: Segment[] = [];
  for (let i = 0; i <= count; i++) {
    const x = (startPx + i * spacing) / scale;
    const v = valueAt(pw, x);
    if (Math.abs(v * k) < 1.5) continue;
    hatch.push({ op: 'M', p: at(f, x) }, { op: 'L', p: at(f, x, normal.x * k * v, normal.y * k * v) });
  }

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

/** How far each of two values side by side stands off their shared ordinate line, px */
const FLANK_PX = 1;

/**
 * Values of different diagrams on one ordinate line - the same point of a member, the same way out
 * - that would run into each other along it, written along the line: the two stand side by side,
 * each half a line aside, meeting at the line, rather than one pushed further out. Each keeps its
 * usual places after that, and the side by side places may cross the other diagram's outline.
 */
const sideBySide = (values: readonly SceneText[], fontSize: number): SceneText[] => {
  const line = (t: SceneText) => {
    const length = Math.hypot(t.at.dx, t.at.dy);
    if (t.rotate === undefined || !(length > 0)) return null;
    const along = textWidth(t.text, t.size ?? fontSize);
    return { ux: t.at.dx / length, uy: t.at.dy / length, from: length, to: length + along };
  };
  const flank = (t: SceneText, sign: 1 | -1): SceneText => {
    const r = ((t.rotate ?? 0) * Math.PI) / 180;
    // The text's own down, turned (see tipPlacements)
    const side = { x: -Math.sin(r) * FLANK_PX * sign, y: Math.cos(r) * FLANK_PX * sign };
    const own: TextPlacement = { at: t.at, align: t.align, baseline: t.baseline, rotate: t.rotate };
    return {
      ...t,
      at: shift(t.at, side.x, side.y),
      baseline: sign > 0 ? 'top' : 'bottom',
      acrossDiagrams: true,
      alternatives: [own, ...(t.alternatives ?? [])],
    };
  };
  const out = [...values];
  const paired = new Set<number>();
  for (let i = 0; i < out.length; i++) {
    const a = line(out[i]);
    if (!a || paired.has(i)) continue;
    for (let j = i + 1; j < out.length; j++) {
      const b = line(out[j]);
      if (!b || paired.has(j) || out[i].group === out[j].group) continue;
      const sameLine =
        Math.abs(out[i].at.x - out[j].at.x) < 1e-9 &&
        Math.abs(out[i].at.z - out[j].at.z) < 1e-9 &&
        a.ux * b.ux + a.uy * b.uy > 0.999;
      if (!sameLine || a.from >= b.to + 2 || b.from >= a.to + 2) continue;
      out[i] = flank(out[i], -1);
      out[j] = flank(out[j], 1);
      paired.add(i).add(j);
      break;
    }
  }
  return out;
};

/**
 * Where a value goes: just beyond the tip of the ordinate it denotes, along that ordinate, so it
 * reads as the ordinate's continuation. With `axis` the text turns to run along the ordinate
 * (across the member), as the app writes it, never upside down. Each further place moves it
 * outward along the same ordinate - it never leaves its tip.
 */
export const tipPlacements = (
  tip: Anchor,
  out: Vec,
  mode: ResultLabelMode,
  gaps: readonly number[] = [5, 11, 17],
  asides: readonly number[] = [4]
): TextPlacement[] =>
  gaps.flatMap((gap): TextPlacement[] => {
    if (mode === 'horizontal') {
      const p = placeText(tip, out, gap);
      // Still hanging from the tip, but reaching to one side of it: clear of a member that meets
      // the ordinate there, as a column does under a beam's corner value.
      // A few pixels aside, so the text does not start right on the member it clears.
      return [
        p,
        ...asides.flatMap((d): TextPlacement[] =>
          p.baseline === 'middle'
            ? [
                { ...p, at: shift(p.at, 0, d), baseline: 'top' },
                { ...p, at: shift(p.at, 0, -d), baseline: 'bottom' },
              ]
            : [
                { ...p, at: shift(p.at, d, 0), align: 'start' },
                { ...p, at: shift(p.at, -d, 0), align: 'end' },
              ]
        ),
      ];
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
    return [
      p,
      ...asides.flatMap((d): TextPlacement[] => {
        const side = { x: -Math.sin(r) * d, y: Math.cos(r) * d };
        return [
          { ...p, at: shift(p.at, side.x, side.y), baseline: 'top' },
          { ...p, at: shift(p.at, -side.x, -side.y), baseline: 'bottom' },
        ];
      }),
    ];
  });

/**
 * The numbers on one diagram: every value at the tip of its own ordinate. A rigid corner is
 * written once, at the tip of the member with more room around it (the other's tip in reserve); a
 * step shows both its values; every non-zero member end and interior extreme is written, as a
 * textbook labels a diagram. Diagram values carry no unit (the reader knows it from the result).
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
  // Further out along its own ordinate only, and not far: moved along the member, a value would
  // stand by another point of the diagram, and far out it reads as nobody's. The 4 px aside only
  // clears a member meeting the tip. A value with no room near its tip is left out.
  const spots = (tip: Anchor, out: Vec, m: ResultLabelMode): TextPlacement[] => tipPlacements(tip, out, m);
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
  // Written once mid-member, or at its ends as any other diagram
  const once = (pw: Piecewise) => options.constantDiagrams !== 'ends' && isConstant(pw);

  const push = (places: readonly TextPlacement[], content: string, v: number, members: string[]) => {
    // A value that rounds to nothing in the chosen format (solver noise at a free end) is not written
    if (!/[1-9]/.test(content)) return;
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
      if (!pw || pw.length === 0 || !f || once(pw)) return [];
      const end = m.start === node.id ? 0 : m.end === node.id ? 1 : -1;
      if (end === -1) return [];
      const x = end === 0 ? 0 : f.length;
      const v = valueAt(pw, x, end === 0 ? 'right' : 'left');
      if (Math.abs(v) <= zero) return [];
      const n = normalOf(f);
      // The member leaves the node this way.
      const away = end === 0 ? { x: f.tx, y: f.tz } : { x: -f.tx, y: -f.tz };
      return [
        {
          m,
          f,
          v,
          away,
          out: { x: n.x * Math.sign(v), y: n.y * Math.sign(v) },
          tip: at(f, x, n.x * k * v, n.y * k * v),
        },
      ];
    });
    if (ends.length === 0) continue;

    // A moment is continuous round a rigid joint: one value, written once. A shear or normal force of
    // the same size on both sides of a support is a step, and both its values are written.
    if (
      q === 'M' &&
      options.cornerValues !== 'each' &&
      ends.length >= 2 &&
      ends.every((e) => close(Math.abs(e.v), Math.abs(ends[0].v)))
    ) {
      // One value for the joint. The ordinate that points along another member is crowded by that
      // member's own diagram; the one pointing away from every other member has the room.
      const crowding = (e: (typeof ends)[number]) =>
        Math.max(-1, ...ends.filter((o) => o !== e).map((o) => e.out.x * o.away.x + e.out.y * o.away.y));
      const ranked = [...ends].sort((a, b) => crowding(a) - crowding(b) || Math.abs(b.f.tx) - Math.abs(a.f.tx));
      const places = ranked.flatMap((e) => spots(e.tip, e.out, mode));
      const shown = ranked[0].v;
      push(
        places,
        number(shown),
        shown,
        ends.map((e) => e.m.id)
      );
      continue;
    }
    // A diagram running straight on through the node with the same value is one value, written once
    // (at the first member's tip, the other's in reserve); members at an angle keep one each
    const written = new Set<(typeof ends)[number]>();
    for (const e of ends) {
      if (written.has(e)) continue;
      const on = ends.find(
        (o) =>
          o !== e &&
          !written.has(o) &&
          e.away.x * o.away.x + e.away.y * o.away.y < -0.995 &&
          close(e.v, o.v) &&
          e.out.x * o.out.x + e.out.y * o.out.y > 0.995
      );
      written.add(e);
      if (on) {
        written.add(on);
        push([...spots(e.tip, e.out, mode), ...spots(on.tip, on.out, mode)], number(e.v), e.v, [e.m.id, on.m.id]);
      } else push(spots(e.tip, e.out, mode), number(e.v), e.v, [e.m.id]);
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
      if (!once(pw)) continue;
      const v = evalPiece(pw[0], pw[0].x0);
      // Mid-member, or a quarter of the way along either way when a load's value stands there
      const along = [0.5, 0.25, 0.75].flatMap((t) => spots(tipAt(f.length * t, v), outOf(v), mode));
      if (Math.abs(v) > zero) push(along, number(v), v, [m.id]);
      continue;
    }
    for (const b of innerBreaks(pw)) {
      const left = valueAt(pw, b, 'left');
      const right = valueAt(pw, b, 'right');
      if (close(left, right)) {
        if (Math.abs(left) > zero) push(spots(tipAt(b, left), outOf(left), mode), number(left), left, [m.id]);
        continue;
      }
      // A step: both tips, the value just before and just after.
      for (const v of [left, right]) {
        if (Math.abs(v) > zero) push(spots(tipAt(b, v), outOf(v), mode), number(v), v, [m.id]);
      }
    }
    for (const p of pw) {
      for (const x of pieceExtrema(p)) {
        const v = evalPiece(p, x);
        if (Math.abs(v) > zero) push(spots(tipAt(x, v), outOf(v), mode), number(v), v, [m.id]);
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
export const isBarStructure = (model: PlotModel, results: Readonly<Record<string, MemberResults>>): boolean =>
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
  const forceUnit = options.units.force;
  const number = (v: number) => formatNumber(v * forceUnit.scale, options.numberFormat);
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

  return bars.map(({ m, f, v }, i): SceneItem => {
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
      entity: memberEntity(m.id),
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

/**
 * Each member's name along it, at mid-length on the side away from its dashed fibres, as the app
 * writes it. Never upside down. Below every value in priority: when crowded, it slides along the
 * member, then crosses to the fibres' side, and gives way last.
 */
const MEMBER_LABEL_PRIORITY = 3;
const memberLabelItems = (model: PlotModel, frames: ReadonlyMap<string, MemberFrame>, size: Sizes): SceneItem[] =>
  model.members.flatMap((m): SceneItem[] => {
    const f = frames.get(m.id);
    if (!f) return [];
    let angle = (Math.atan2(f.tz, f.tx) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle <= -90) angle += 180;
    const r = (angle * Math.PI) / 180;
    // "Up" as the text reads, whichever way the member was drawn
    const up = { x: Math.sin(r), y: -Math.cos(r) };
    // The fibres lie on local +z, (nx, nz): the name goes to the other side first
    const away = f.nx * up.x + f.nz * up.y > 0 ? -1 : 1;
    const gap = size.member / 2 + 3;
    const places: TextPlacement[] = [];
    for (const side of [away, -away]) {
      for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
        places.push({
          at: at(f, f.length * t, up.x * gap * side, up.y * gap * side),
          align: 'middle',
          baseline: side > 0 ? 'bottom' : 'top',
        });
      }
    }
    const [first, ...rest] = places;
    return [
      {
        kind: 'text',
        group: 'memberLabels',
        entity: memberEntity(m.id),
        layer: LAYERS.label,
        tone: 'ink',
        text: m.id,
        ...first,
        priority: MEMBER_LABEL_PRIORITY,
        rotate: angle,
        alternatives: rest,
      },
    ];
  });

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

type Displaced = { member: string; x: number; u: number; w: number; size: number };

/**
 * The largest displacement, for its label: on every member whose own peak is as large (to 0.1 %),
 * so the two spans of a symmetric beam are both labelled, not one of them at random.
 */
const largestDisplacements = (
  model: PlotModel,
  frames: ReadonlyMap<string, MemberFrame>,
  results: Readonly<Record<string, MemberResults>>
): Displaced[] => {
  const peaks: Displaced[] = [];
  for (const m of model.members) {
    const r = results[m.id];
    const f = frames.get(m.id);
    if (!r || !f) continue;
    let best: Displaced | null = null;
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
        const size = Math.hypot(u, w);
        if (!best || size > best.size) best = { member: m.id, x, u, w, size };
      }
    }
    if (best) peaks.push(best);
  }
  const largest = Math.max(0, ...peaks.map((p) => p.size));
  if (!(largest > 0)) return [];
  // A peak at a shared node is one point: keep it once
  const seen: { x: number; z: number }[] = [];
  return peaks.filter((p) => {
    if (p.size < largest * 0.999) return false;
    const pt = pointAlong(frameOf(frames, p.member), p.x);
    if (seen.some((o) => Math.hypot(o.x - pt.x, o.z - pt.z) < 1e-6)) return false;
    seen.push(pt);
    return true;
  });
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
  const connected = new Set(
    options.freeNodes ? model.nodes.map((n) => n.id) : model.members.flatMap((m) => [m.start, m.end])
  );
  const fmt = (v: number, u: Unit) => formatQuantity(v, u, options.numberFormat);
  const preset = options.compact ? SIZES.compact : SIZES.full;
  const size: Sizes = { ...preset, ...options.sizes };
  const { layers } = options;
  const items: SceneItem[] = [];

  const results = model.results;
  if (results) {
    const k = diagramScales(model, options);
    /** The diagrams' values, placed together once all are known */
    const values: SceneText[] = [];
    for (const q of ['N', 'V', 'M'] as const) {
      if (!layers.has(q) || !(k[q] > 0)) continue;
      if (q === 'N' && isBarStructure(model, results.members)) {
        items.push(...barForceLabels(model, frames, results.members, options));
        continue;
      }
      const side = diagramSide(q, options.momentOnTensionSide, options);
      for (const m of model.members) {
        const r = results.members[m.id];
        const f = frameOf(frames, m.id);
        if (r && r[q].some((p) => pieceDegree(p) !== null)) {
          const normal = { x: f.nx * side, y: f.nz * side };
          const closed = [0, 1].map(
            (end) => !continuesInto(model, frames, results.members, q, side, m, end as 0 | 1)
          ) as [boolean, boolean];
          items.push(
            ...tagged(
              diagramShape(q, f, r[q], DIAGRAM_TONE[q], k[q], normal, options.scale, closed, options.diagramFill),
              memberEntity(m.id)
            )
          );
          if (options.showDegrees)
            items.push(...tagged(degreeLabels(q, f, r[q], k[q], normal, options), memberEntity(m.id)));
        }
      }
      const labels = diagramLabels(model, frames, results.members, q, k[q], side, options);
      values.push(
        ...(options.compact ? limitPerMember(labels, 2) : labels).map((c) => ({
          ...c.item,
          entity: memberEntity(c.members[0]),
        }))
      );
    }
    items.push(...(options.sideBySide ? sideBySide(values, options.fontSize ?? 13) : values));
    if (layers.has('w') && k.w > 0) {
      for (const m of model.members) {
        const r = results.members[m.id];
        if (r)
          items.push({ ...deformedPath(frameOf(frames, m.id), r, k.w, size.deformed), entity: memberEntity(m.id) });
      }
      for (const peak of largestDisplacements(model, frames, results.members)) {
        const f = frameOf(frames, peak.member);
        const d = { x: peak.u * f.tx + peak.w * f.nx, y: peak.u * f.tz + peak.w * f.nz };
        const p = at(f, peak.x, k.w * d.x, k.w * d.y);
        items.push({
          ...text(
            'w',
            p,
            unit(d.x, d.y),
            5,
            options.displacementText
              ? options.displacementText(peak.size * options.units.displacement.scale)
              : formatNumber(peak.size * options.units.displacement.scale, options.numberFormat),
            'deformed',
            7
          ),
          entity: memberEntity(peak.member),
        });
      }
    }
  }

  if (layers.has('members')) items.push(...memberItems(model, frames, size), ...hingeItems(model, frames, size));
  if (layers.has('supports'))
    items.push(...supportItems(model, connected, options.labelsAvoidSupports === true, options.supportScale ?? 1));
  if (layers.has('nodes') || layers.has('nodeLabels')) items.push(...nodeItems(model, connected, layers, size));
  if (layers.has('memberLabels')) items.push(...memberLabelItems(model, frames, size));
  if (layers.has('dimensions')) items.push(...dimensionItems(model, frames, options, fmt));
  // Bare numbers for loads written at their ends, as the editor does
  const loadFmt =
    options.loadLabels === 'ends' ? (v: number, u: Unit) => formatNumber(v * u.scale, options.numberFormat) : fmt;
  if (layers.has('loads')) items.push(...loadItems(model, frames, options, size, loadFmt));
  if (layers.has('reactions')) {
    const reactions = options.reactionLabels === 'names' ? unknownReactions(model) : results?.reactions;
    if (reactions) items.push(...reactionItems(model, reactions, options, size));
  }

  return items;
};
