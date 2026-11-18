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

/** Short ticks behind a wall or under a rail, falling away from it. */
const ticks = (y: number, depth: number, xs: readonly number[]): GlyphPart[] =>
  xs.map((x) => ({ points: [[x, y] as Point, [x - depth, y + depth] as Point], weight: 'thin' as const }));

/**
 * The website's figures (HeroFigure, BuildSteps): an outlined triangle filled with the page colour,
 * its apex a hair below the node so the member's round cap stays clear of it.
 */
const triangle = (height: number, half: number): GlyphPart => ({
  points: [
    [0, 2],
    [-half, height],
    [half, height],
  ],
  closed: true,
  weight: 'regular',
  fill: 'paper',
});

const line = (x0: number, y0: number, x1: number, y1: number, weight: GlyphPart['weight']): GlyphPart => ({
  points: [
    [x0, y0],
    [x1, y1],
  ],
  weight,
});

const TICK_XS = [-10, -4, 2, 8, 14];

const GLYPHS: Record<Exclude<SupportKind, 'none'>, readonly GlyphPart[]> = {
  pin: [triangle(20, 11), line(-16, 20, 16, 20, 'regular')],
  // A second line under the triangle's base, clear of it: the rollers' track.
  roller: [triangle(19, 10), line(-14, 24, 14, 24, 'regular')],
  fixed: [line(-16, 0, 16, 0, 'bold'), ...ticks(0, 6, TICK_XS)],
  slider: [
    line(-16, -6, 16, -6, 'regular'),
    line(-16, 6, 16, 6, 'regular'),
    ...ticks(6, 6, TICK_XS),
    ...TICK_XS.map((x) => line(x, -6, x - 6, -12, 'thin')),
  ],
  rotation: (
    [
      [
        [-14, 5],
        [-5, 5],
        [-5, 14],
      ],
      [
        [5, 14],
        [5, 5],
        [14, 5],
      ],
      [
        [14, -5],
        [5, -5],
        [5, -14],
      ],
      [
        [-5, -14],
        [-5, -5],
        [-14, -5],
      ],
    ] as Point[][]
  ).map((points): GlyphPart => ({ points, weight: 'regular' })),
};

export const supportGlyph = (kind: SupportKind): readonly GlyphPart[] => (kind === 'none' ? [] : GLYPHS[kind]);

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
