/**
 * Support symbols. Each restrained DOF combination has one symbol, drawn in screen pixels in a frame
 * where +y points to the ground, then turned to suit the node: by a rotated support's axes, and away
 * from the members that meet there.
 */
import type { Fixity, PlotModel, PlotNode } from './model';
import { memberFrame, nodeMap } from './model';

export type SupportKind =
  /** Dx, Dz and Ry held: a clamp. */
  | 'fixed'
  /** Dx and Dz held. */
  | 'pin'
  /** One translation held: Dz (rolls along x) or Dx (rolls along z). */
  | 'roller'
  /** One translation and the rotation held: slides along the free axis between two rails. */
  | 'slider'
  /** Only the rotation held. */
  | 'rotation'
  | 'none';

export const supportKind = (f: Fixity): SupportKind => {
  if (f.dx && f.dz) return f.ry ? 'fixed' : 'pin';
  if (f.dx || f.dz) return f.ry ? 'slider' : 'roller';
  return f.ry ? 'rotation' : 'none';
};

export type Point = readonly [number, number];

export interface GlyphPart {
  readonly points: readonly Point[];
  readonly closed?: boolean;
  /** `bold` for the line the structure bears on, `thin` for hatching. */
  readonly weight: 'thin' | 'regular' | 'bold';
  /** Painted with the background, so the member does not show through a triangle. */
  readonly fill?: 'paper';
}

/*
 * The EduBeam app's support symbols (its SVGViewerDefs markers), stroke for stroke, so a figure
 * reads like the app. Turned into this frame, where +y points to the ground and x runs along it.
 * Outlines are `regular`, hatching `thin`, a clamp's wall `bold`: 1.8, 1.2 and 2.4 px, as the app
 * draws them at every support size.
 */

const line = (x0: number, y0: number, x1: number, y1: number, weight: GlyphPart['weight']): GlyphPart => ({
  points: [
    [x0, y0],
    [x1, y1],
  ],
  weight,
});

/** An outlined triangle, its apex on the node and its base 30 px wide, 20 px towards the ground. */
const TRIANGLE: GlyphPart = {
  points: [
    [0, 0],
    [-15, 20],
    [15, 20],
  ],
  closed: true,
  weight: 'regular',
  // Painted with the background, so a diagram's hatching does not show through it
  fill: 'paper',
};

/**
 * A wall 34 px long, a little off centre as the app draws it, with seven 10 px strokes behind it,
 * slanting along it. `side` is +1 for the ground side, −1 for the other (a slider's second rail).
 */
const wall = (y: number, side: 1 | -1, weight: GlyphPart['weight']): GlyphPart[] => [
  line(-18.5, y, 15.5, y, weight),
  ...Array.from({ length: 7 }, (_, i) => {
    const a = ((i + 1) * 40) / 7 - 24.5;
    return line(a, y, a + 10, y + side * 10, 'thin');
  }),
];

/** Three short strokes across a corner of the rotation symbol, in the quadrant (sx, sy). */
const cornerDashes = (sx: 1 | -1, sy: 1 | -1): GlyphPart[] =>
  [0, 1, 2].map((k) => line(sx * (8 + 4 * k), sy * 7, sx * 7, sy * (8 + 4 * k), 'thin'));

const GLYPHS: Record<Exclude<SupportKind, 'none'>, readonly GlyphPart[]> = {
  pin: [TRIANGLE],
  // The rollers' track, 5 px under the triangle's base
  roller: [TRIANGLE, line(-15, 25, 15, 25, 'regular')],
  fixed: wall(0, 1, 'bold'),
  // Two rails 10 px apart, each hatched on its outer side: it slides along them
  slider: [...wall(5, 1, 'regular'), ...wall(-5, -1, 'regular')],
  rotation: [
    line(-20, 5, -5, 5, 'regular'),
    line(-20, -5, -5, -5, 'regular'),
    line(5, -5, 20, -5, 'regular'),
    line(5, 5, 20, 5, 'regular'),
    line(-5, -20, -5, -5, 'regular'),
    line(5, -20, 5, -5, 'regular'),
    line(5, 5, 5, 20, 'regular'),
    line(-5, 5, -5, 20, 'regular'),
    ...cornerDashes(1, 1),
    ...cornerDashes(-1, -1),
    ...cornerDashes(-1, 1),
    ...cornerDashes(1, -1),
  ],
};

/** Drawn at the app's default support size, 80 % of its markers' own dimensions */
const SUPPORT_SIZE = 0.8;
const sized = (parts: readonly GlyphPart[]): readonly GlyphPart[] =>
  parts.map((part) => ({
    ...part,
    points: part.points.map(([x, y]): Point => [x * SUPPORT_SIZE, y * SUPPORT_SIZE]),
  }));
const SIZED: Record<Exclude<SupportKind, 'none'>, readonly GlyphPart[]> = {
  pin: sized(GLYPHS.pin),
  roller: sized(GLYPHS.roller),
  fixed: sized(GLYPHS.fixed),
  slider: sized(GLYPHS.slider),
  rotation: sized(GLYPHS.rotation),
};

export const supportGlyph = (kind: SupportKind): readonly GlyphPart[] => (kind === 'none' ? [] : SIZED[kind]);

export interface SupportPlacement {
  readonly node: string;
  readonly kind: SupportKind;
  /** Clockwise turn of the glyph on screen, degrees. */
  readonly rotation: number;
}

/** Sum of unit vectors from the node along each member that meets it. */
export const memberDirections = (model: PlotModel, node: PlotNode): { x: number; z: number; count: number } => {
  const nodes = nodeMap(model);
  let x = 0;
  let z = 0;
  let count = 0;
  for (const m of model.members) {
    if (m.start !== node.id && m.end !== node.id) continue;
    const f = memberFrame(model, m, nodes);
    const sign = m.start === node.id ? 1 : -1;
    x += sign * f.tx;
    z += sign * f.tz;
    count++;
  }
  return { x, z, count };
};

const DEG = 180 / Math.PI;

/** The glyph's ground direction, (0, 1) turned by `rotation` degrees clockwise. */
export const groundDirection = (rotation: number): { x: number; z: number } => {
  const r = rotation / DEG;
  return { x: -Math.sin(r), z: Math.cos(r) };
};

/**
 * Turns the ground side away from the members when they come from it - a hanger's pin above it.
 * A member merely leaning toward the ground side (a beam on a tilted roller) leaves it as it is.
 */
const awayFromMembers = (rotation: number, members: { x: number; z: number }): number => {
  const g = groundDirection(rotation);
  const length = Math.hypot(members.x, members.z);
  return length > 1e-9 && (g.x * members.x + g.z * members.z) / length > 0.7 ? rotation + 180 : rotation;
};

export const supportPlacement = (model: PlotModel, node: PlotNode): SupportPlacement => {
  const kind = supportKind(node.fixity);
  const members = memberDirections(model, node);
  const angle = node.angle * DEG;

  const rotation = ((): number => {
    switch (kind) {
      case 'pin':
        return awayFromMembers(angle, members);
      case 'roller':
        // Held along z, it rolls along x with the ground below; held along x, the ground is beside it.
        return awayFromMembers(node.fixity.dz ? angle : angle - 90, members);
      case 'fixed': {
        const length = Math.hypot(members.x, members.z);
        if (length < 1e-9) return angle;
        // The clamp faces the members: its ground points straight away from them.
        return Math.atan2(members.x / length, -members.z / length) * DEG;
      }
      case 'slider':
        // The rails run along the free axis.
        return node.fixity.dz ? angle : angle + 90;
      default:
        return 0;
    }
  })();

  return { node: node.id, kind, rotation: normalizeDegrees(rotation) };
};

/** An angle in (−180, 180]. */
export const normalizeDegrees = (deg: number): number => {
  const r = ((((deg + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
};

/** How far the turned glyph reaches from the node along the unit direction (x, z), in px. */
export const glyphReach = (kind: SupportKind, rotation: number, x: number, z: number): number => {
  const r = rotation / DEG;
  const c = Math.cos(r);
  const s = Math.sin(r);
  let reach = 0;
  for (const part of supportGlyph(kind)) {
    for (const [px, py] of part.points) reach = Math.max(reach, (px * c - py * s) * x + (px * s + py * c) * z);
  }
  return reach;
};
