/**
 * The stacked textbook figure: a straight beam with its loads, and beneath it on one x axis the
 * diagrams of N, V, M and the deflection w. Pure geometry; DiagramStack.vue draws it.
 */
import { memberFrame, nodeMap, type MemberResults, type PlotLoad, type PlotModel } from './model';
import {
  evalPiece,
  extremes,
  innerBreaks,
  maxAbs,
  pieceToBeziers,
  valueAt,
  type Piecewise,
  type Side,
} from './polynomial';

export type StackRow = 'N' | 'V' | 'M' | 'w';

export interface LineMember {
  readonly id: string;
  /** Distance of the member's start from the line's start, m. */
  readonly offset: number;
  readonly length: number;
}

export interface BeamLine {
  readonly members: readonly LineMember[];
  /** Model x and z of the line's start. */
  readonly x0: number;
  readonly z: number;
  readonly length: number;
  /** Nodes on the line with their distance from its start. */
  readonly nodes: readonly { readonly id: string; readonly at: number }[];
}

/**
 * The members as one horizontal line, left to right. The figure's x axis is the beam's, so an
 * inclined or broken line, or a member drawn right to left (whose shear would read backwards), is
 * refused rather than drawn wrongly.
 */
export const beamLine = (model: PlotModel, ids?: readonly string[]): BeamLine => {
  const nodes = nodeMap(model);
  const chosen = ids ? ids.map((id) => model.members.find((m) => m.id === id)) : [...model.members];
  if (chosen.length === 0) throw new Error('A diagram stack needs at least one member');
  const frames = chosen.map((m) => {
    if (!m) throw new Error('A diagram stack names a member that does not exist');
    const f = memberFrame(model, m, nodes);
    if (Math.abs(f.tz) > 1e-9 || f.tx < 0) {
      throw new Error(`Member ${m.id} is not horizontal and drawn left to right, as a diagram stack needs`);
    }
    return { m, f };
  });
  frames.sort((a, b) => a.f.x - b.f.x);
  const x0 = frames[0].f.x;
  const z = frames[0].f.z;
  const tolerance = 1e-9 * Math.max(1, ...frames.map(({ f }) => f.length));
  let end = x0;
  for (const { m, f } of frames) {
    if (Math.abs(f.z - z) > tolerance || Math.abs(f.x - end) > tolerance) {
      throw new Error(`Member ${m.id} does not continue the line of the diagram stack`);
    }
    end = f.x + f.length;
  }
  const lineNodes = new Map<string, number>();
  for (const { m, f } of frames) {
    lineNodes.set(m.start, f.x - x0);
    lineNodes.set(m.end, f.x + f.length - x0);
  }
  return {
    members: frames.map(({ m, f }) => ({ id: m.id, offset: f.x - x0, length: f.length })),
    x0,
    z,
    length: end - x0,
    nodes: [...lineNodes].map(([id, at]) => ({ id, at })).sort((a, b) => a.at - b.at),
  };
};

/** One result along the whole line, as a single piecewise polynomial in the line's x. */
export const lineDiagram = (model: PlotModel, line: BeamLine, row: StackRow): Piecewise => {
  const results = model.results?.members ?? {};
  return line.members.flatMap((m) => {
    const r: MemberResults | undefined = results[m.id];
    return (r?.[row] ?? []).map((p) => ({ x0: p.x0 + m.offset, x1: p.x1 + m.offset, c: p.c }));
  });
};

/** The model restricted to the line: its nodes and members, the loads on them and their reactions. */
export const lineModel = (model: PlotModel, line: BeamLine, omit?: PlotLoad): PlotModel => {
  const memberIds = new Set(line.members.map((m) => m.id));
  const nodeIds = new Set(line.nodes.map((n) => n.id));
  const onLine = (l: PlotLoad) => ('member' in l ? memberIds.has(l.member) : nodeIds.has(l.node));
  return {
    nodes: model.nodes.filter((n) => nodeIds.has(n.id)),
    members: model.members.filter((m) => memberIds.has(m.id)),
    loads: model.loads.filter((l) => l !== omit && onLine(l)),
    results: model.results && {
      members: model.results.members,
      reactions: model.results.reactions.filter((r) => nodeIds.has(r.node)),
    },
  };
};

/** The point force at line position `at`: on a member or at a node. */
export const pointLoadAt = (model: PlotModel, line: BeamLine, at: number): PlotLoad | undefined => {
  const tolerance = 1e-6 * Math.max(1, line.length);
  return model.loads.find((l) => {
    if (l.kind === 'pointForce') {
      const m = line.members.find((lm) => lm.id === l.member);
      return !!m && Math.abs(m.offset + l.at - at) <= tolerance;
    }
    if (l.kind === 'nodalForce') {
      const n = line.nodes.find((ln) => ln.id === l.node);
      return !!n && Math.abs(n.at - at) <= tolerance;
    }
    return false;
  });
};

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * The outline of a row's diagram in px. `sx` maps line x (m) and `sy` a value to screen; a step at a
 * break is the straight vertical between the two pieces. `close` returns to the axis at both ends.
 */
export const rowOutline = (
  pw: Piecewise,
  sx: (x: number) => number,
  sy: (v: number) => number,
  close: boolean
): string => {
  if (pw.length === 0) return '';
  const parts: string[] = [];
  pw.forEach((piece, i) => {
    const start = `${r1(sx(piece.x0))},${r1(sy(evalPiece(piece, piece.x0)))}`;
    if (i === 0) parts.push(close ? `M${r1(sx(piece.x0))},${r1(sy(0))}L${start}` : `M${start}`);
    else parts.push(`L${start}`);
    for (const [, c1, c2, p] of pieceToBeziers(piece)) {
      parts.push(
        `C${r1(sx(c1[0]))},${r1(sy(c1[1]))} ${r1(sx(c2[0]))},${r1(sy(c2[1]))} ${r1(sx(p[0]))},${r1(sy(p[1]))}`
      );
    }
  });
  if (close) parts.push(`L${r1(sx(pw[pw.length - 1].x1))},${r1(sy(0))}Z`);
  return parts.join('');
};

/** Ordinates from the axis to the outline, `spacing` px apart: the hatching across the beam. */
export const rowOrdinates = (
  pw: Piecewise,
  sx: (x: number) => number,
  sy: (v: number) => number,
  spacing: number
): string => {
  if (pw.length === 0) return '';
  const a = sx(pw[0].x0);
  const b = sx(pw[pw.length - 1].x1);
  const count = Math.floor((b - a) / spacing);
  const start = a + (b - a - count * spacing) / 2;
  const scale = (pw[pw.length - 1].x1 - pw[0].x0) / (b - a);
  const lines: string[] = [];
  for (let i = 0; i <= count; i++) {
    const px = start + i * spacing;
    const v = valueAt(pw, pw[0].x0 + (px - a) * scale);
    const y0 = sy(0);
    const y1 = sy(v);
    if (Math.abs(y1 - y0) >= 1.5) lines.push(`M${r1(px)},${r1(y0)}V${r1(y1)}`);
  }
  return lines.join('');
};

/** The value range a row is scaled to: the diagram's own, always including zero. */
export const rowRange = (pw: Piecewise): [number, number] => {
  const e = extremes(pw);
  return e ? [Math.min(0, e.min.value), Math.max(0, e.max.value)] : [0, 0];
};

export interface RowPeak {
  readonly x: number;
  readonly value: number;
  readonly side: Side;
  readonly kind: 'max' | 'min';
}

/** The largest and smallest values worth writing on a row: both, when each is a real share of the row. */
export const rowPeaks = (pw: Piecewise): RowPeak[] => {
  const e = extremes(pw);
  if (!e) return [];
  const size = maxAbs(pw);
  const peaks: RowPeak[] = [];
  if (e.max.value > 0.02 * size) peaks.push({ ...e.max, kind: 'max' });
  if (e.min.value < -0.02 * size) peaks.push({ ...e.min, kind: 'min' });
  return peaks;
};

/** Where the result breaks: supports, joints and point loads - the places the cursor snaps to. */
export const rowBreaks = (pw: Piecewise): number[] => innerBreaks(pw);
