/**
 * Reading values off a plot: the member point under the pointer, and the results there - both
 * values where a point load or a support makes a step.
 */
import { memberFrame, nodeMap, type MemberFrame, type MemberResults, type PlotModel } from './model';
import { innerBreaks, valueAt } from './polynomial';
import { project, anchor, type Transform } from './scene';
import { formatNumber, formatQuantity, type Units } from './units';

/** Either side of a point; the two are equal where the result is continuous. */
export interface SidedValue {
  readonly left: number;
  readonly right: number;
}

export type ReadoutQuantity = 'N' | 'V' | 'M' | 'w';

export interface Readout {
  readonly member: string;
  /** Metres along the member from its start node. */
  readonly x: number;
  /** The member point on screen, px. */
  readonly px: number;
  readonly py: number;
  readonly values: Readonly<Record<ReadoutQuantity, SidedValue>>;
}

/** The results at x, snapping to a break within `snap` metres so a step shows both its values. */
export const readMember = (
  results: MemberResults,
  x: number,
  snap = 0
): { x: number; values: Record<ReadoutQuantity, SidedValue> } => {
  const breaks = innerBreaks(results.V);
  const near = breaks.find((b) => Math.abs(b - x) <= snap);
  const at = near ?? x;
  const sided = (q: ReadoutQuantity): SidedValue => ({
    left: valueAt(results[q], at, 'left'),
    right: valueAt(results[q], at, 'right'),
  });
  return { x: at, values: { N: sided('N'), V: sided('V'), M: sided('M'), w: sided('w') } };
};

/** The member nearest the screen point (px, py), within `reach` px, and its results there. */
export const readoutAt = (model: PlotModel, t: Transform, px: number, py: number, reach: number): Readout | null => {
  const results = model.results?.members;
  if (!results) return null;
  const nodes = nodeMap(model);
  let best: { member: string; s: number; d: number; frame: MemberFrame } | null = null;
  for (const m of model.members) {
    const f = memberFrame(model, m, nodes);
    const [ax, ay] = project(t, anchor(f.x, f.z));
    const [bx, by] = project(t, anchor(f.x + f.tx * f.length, f.z + f.tz * f.length));
    const lx = bx - ax;
    const ly = by - ay;
    const s = Math.min(1, Math.max(0, ((px - ax) * lx + (py - ay) * ly) / (lx * lx + ly * ly || 1)));
    const d = Math.hypot(ax + s * lx - px, ay + s * ly - py);
    if (d <= reach && (!best || d < best.d)) best = { member: m.id, s, d, frame: f };
  }
  if (!best || !results[best.member]) return null;
  // Six pixels either way snap to a step.
  const snap = 6 / t.s;
  const f = best.frame;
  const read = readMember(results[best.member], best.s * f.length, snap);
  const [x, y] = project(t, anchor(f.x + f.tx * read.x, f.z + f.tz * read.x));
  return { member: best.member, x: read.x, px: x, py: y, values: read.values };
};

const SYMBOL: Record<ReadoutQuantity, string> = { N: 'N', V: 'V', M: 'M', w: 'w' };

/** "M = 54 kNm", or "V = 13.3 → −6.7 kN" across a step. */
export const formatReadout = (r: Readout, q: ReadoutQuantity, units: Units, format?: Intl.NumberFormat): string => {
  const unit = q === 'M' ? units.moment : q === 'w' ? units.displacement : units.force;
  const { left, right } = r.values[q];
  const same = formatNumber(left * unit.scale, format) === formatNumber(right * unit.scale, format);
  const value = same
    ? formatQuantity(right, unit, format)
    : `${formatNumber(left * unit.scale, format)} → ${formatQuantity(right, unit, format)}`;
  return `${SYMBOL[q]} = ${value}`;
};
