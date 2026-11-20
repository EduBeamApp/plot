/**
 * Reading values off a plot: the member point under the pointer, and the results there - both
 * values where a point load or a support makes a step.
 */
import { memberFrame, nodeMap, type MemberFrame, type MemberResults, type PlotModel } from './model';
import { innerBreaks, pieceExtrema, valueAt } from './polynomial';
import { anchor, project, segmentHitsBox, textWidth, type Bounds, type Tone, type Transform } from './scene';
import { formatNumber, type Units } from './units';

/** Either side of a point; the two are equal where the result is continuous. */
export interface SidedValue {
  readonly left: number;
  readonly right: number;
}

export type ReadoutQuantity = 'N' | 'V' | 'M' | 'w';

/** Both displacements, for placing the point on the deformed shape (not shown as a value). */
type Displacement = 'u' | 'w';

export interface Readout {
  readonly member: string;
  /** Metres along the member from its start node. */
  readonly x: number;
  /** The member point on screen, px. */
  readonly px: number;
  readonly py: number;
  readonly values: Readonly<Record<ReadoutQuantity, SidedValue>>;
  /** Displacement along the member's local x there, m. */
  readonly u: number;
}

/** Which extreme a pointer snaps to when several are within reach: the largest moment first */
const EXTREME_RANK: Readonly<Record<ReadoutQuantity, number>> = { M: 1, w: 2, V: 3, N: 4 };

/**
 * The results at x, snapping to a point a reader looks for within `snap` metres: a break, so a step
 * shows both its values, or - given the member's `length` - an end; else an interior extreme of a
 * quantity in `extremaOf`, the largest moment (where the shear is zero) before the largest
 * deflection, then shear and normal force. Within a kind, the nearest.
 */
export const readMember = (
  results: MemberResults,
  x: number,
  snap = 0,
  length?: number,
  extremaOf: readonly ReadoutQuantity[] = []
): { x: number; u: number; values: Record<ReadoutQuantity, SidedValue> } => {
  const ends = length === undefined ? [] : [0, length];
  const points = [
    ...[...innerBreaks(results.V), ...ends].map((p) => ({ p, rank: 0 })),
    ...extremaOf.flatMap((q) => results[q].flatMap(pieceExtrema).map((p) => ({ p, rank: EXTREME_RANK[q] }))),
  ];
  let at = x;
  let best: { rank: number; d: number } | null = null;
  for (const { p, rank } of points) {
    const d = Math.abs(p - x);
    if (d > snap) continue;
    if (!best || rank < best.rank || (rank === best.rank && d < best.d)) {
      best = { rank, d };
      at = p;
    }
  }
  // At an end only the member's own side exists
  const only = length === undefined ? undefined : at === 0 ? 'right' : at === length ? 'left' : undefined;
  const sided = (q: ReadoutQuantity | Displacement): SidedValue => {
    if (only) {
      const v = valueAt(results[q], at, only);
      return { left: v, right: v };
    }
    return { left: valueAt(results[q], at, 'left'), right: valueAt(results[q], at, 'right') };
  };
  return { x: at, u: sided('u').right, values: { N: sided('N'), V: sided('V'), M: sided('M'), w: sided('w') } };
};

/**
 * The member nearest the screen point (px, py), within `reach` px, and its results there, snapped
 * to its steps, its ends and the extremes of the quantities in `extremaOf` (see `readMember`).
 */
export const readoutAt = (
  model: PlotModel,
  t: Transform,
  px: number,
  py: number,
  reach: number,
  extremaOf: readonly ReadoutQuantity[] = []
): Readout | null => {
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
  // Eight pixels either way snap to a step, an extreme or the member's end
  const snap = 8 / t.s;
  const f = best.frame;
  const read = readMember(results[best.member], best.s * f.length, snap, f.length, extremaOf);
  const [x, y] = project(t, anchor(f.x + f.tx * read.x, f.z + f.tz * read.x));
  return { member: best.member, x: read.x, px: x, py: y, values: read.values, u: read.u };
};

/** Where a read value sits on the drawing: on its diagram's outline, or on the deformed shape. */
export interface ReadoutMark {
  readonly tone: Tone;
  /** The member point, px. */
  readonly from: readonly [number, number];
  /** The ordinate's tip (or the displaced point), px. */
  readonly to: readonly [number, number];
}

const TONE = { N: 'normal', V: 'shear', M: 'moment', w: 'deformed' } as const satisfies Record<ReadoutQuantity, Tone>;

/**
 * The points on the drawn results that a readout's values belong to: the tip of each shown
 * diagram's ordinate (both tips across a step), and the point on the deformed shape. `k` is px
 * per SI unit, `side` the side each diagram is drawn on (see `diagramScales`, `diagramSide`).
 */
export const readoutMarks = (
  model: PlotModel,
  t: Transform,
  r: Readout,
  shown: readonly ReadoutQuantity[],
  k: Readonly<Record<ReadoutQuantity, number>>,
  side: Readonly<Record<'N' | 'V' | 'M', 1 | -1>>
): ReadoutMark[] => {
  const m = model.members.find((member) => member.id === r.member);
  if (!m) return [];
  const f = memberFrame(model, m, nodeMap(model));
  const px = f.x + f.tx * r.x;
  const pz = f.z + f.tz * r.x;
  const from = project(t, anchor(px, pz));
  return shown.flatMap((q): ReadoutMark[] => {
    if (!(k[q] > 0)) return [];
    if (q === 'w') {
      const w = r.values.w.right;
      const dx = k.w * (r.u * f.tx + w * f.nx);
      const dy = k.w * (r.u * f.tz + w * f.nz);
      return [{ tone: TONE.w, from, to: project(t, anchor(px, pz, dx, dy)) }];
    }
    const { left, right } = r.values[q];
    const values =
      Math.abs(left - right) > 1e-9 * Math.max(1, Math.abs(left), Math.abs(right)) ? [left, right] : [right];
    return values.map((v) => ({
      tone: TONE[q],
      from,
      to: project(t, anchor(px, pz, f.nx * side[q] * k[q] * v, f.nz * side[q] * k[q] * v)),
    }));
  });
};

const SYMBOL: Record<ReadoutQuantity, string> = { N: 'N', V: 'V', M: 'M', w: 'w' };

/**
 * "M = 54 kNm", or "V = 13.3 → −6.7 kN" across a step. `write`, given a value in display units,
 * writes the number in place of `format` (an editor's own style for displacements, say).
 */
export const formatReadout = (
  r: Readout,
  q: ReadoutQuantity,
  units: Units,
  format?: Intl.NumberFormat,
  write?: (value: number) => string
): string => {
  const unit = q === 'M' ? units.moment : q === 'w' ? units.displacement : units.force;
  const { left, right } = r.values[q];
  const number = (si: number) => (write ? write(si * unit.scale) : formatNumber(si * unit.scale, format));
  const withUnit = (si: number) => (unit.symbol ? `${number(si)}\u202f${unit.symbol}` : number(si));
  const value = number(left) === number(right) ? withUnit(right) : `${number(left)} → ${withUnit(right)}`;
  return `${SYMBOL[q]} = ${value}`;
};

/** A value read off the drawing, as a small tag beside the point it belongs to. */
export interface ReadoutTag {
  readonly tone: Tone;
  readonly text: string;
  /** The tag's box, px. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The point it belongs to, px: a diagram's tip, the displaced point, or the member point. */
  readonly at: readonly [number, number];
}

const overlaps = (a: Bounds, b: Bounds, margin: number): boolean =>
  a.minX < b.maxX + margin && b.minX < a.maxX + margin && a.minY < b.maxY + margin && b.minY < a.maxY + margin;

/**
 * Each read value as a tag just past the point it belongs to, along that quantity's own ordinate
 * (out from the member), stepping further out only to keep clear of the tags already placed, the
 * member and the pointer. The station's `x` is the last tag, beside the member point on the side
 * the fewest values take. `member` is the member's line on screen, px.
 */
export const placeReadoutTags = (
  readings: readonly { readonly mark: ReadoutMark; readonly text: string }[],
  caption: string | null,
  member: readonly [readonly [number, number], readonly [number, number]],
  pointer: readonly [number, number],
  fontSize: number,
  /** The visible area, px: a tag that would leave it is put elsewhere */
  viewport?: Bounds
): ReadoutTag[] => {
  const h = fontSize + 8;
  const placed: Bounds[] = [];
  const outside = (b: Bounds): boolean =>
    viewport !== undefined &&
    (b.minX < viewport.minX || b.minY < viewport.minY || b.maxX > viewport.maxX || b.maxY > viewport.maxY);
  const blocked = (b: Bounds): boolean =>
    outside(b) ||
    placed.some((p) => overlaps(p, b, 3)) ||
    segmentHitsBox([member[0][0], member[0][1]], [member[1][0], member[1][1]], {
      minX: b.minX - 2,
      maxX: b.maxX + 2,
      minY: b.minY - 2,
      maxY: b.maxY + 2,
    }) ||
    (pointer[0] > b.minX - 6 && pointer[0] < b.maxX + 6 && pointer[1] > b.minY - 6 && pointer[1] < b.maxY + 6);
  // The member's normal on screen, for a value drawn on the member itself (a zero) and the caption
  const [[ax, ay], [bx, by]] = member;
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const normal = { x: -(by - ay) / len, y: (bx - ax) / len };
  const put = (
    text: string,
    tone: Tone,
    at: readonly [number, number],
    dirs: readonly { x: number; y: number }[]
  ): ReadoutTag | null => {
    const w = textWidth(text, fontSize) + 12;
    // Straight out along its ordinate, never aside: further out, a few px at a time, until clear
    let fallback: Bounds | null = null;
    for (const d of dirs) {
      // The box's near edge `gap` px past the point, straight out along d
      const reach = (Math.abs(d.x) * w) / 2 + (Math.abs(d.y) * h) / 2;
      for (let gap = 7; gap <= 400; gap += 4) {
        const cx = at[0] + d.x * (gap + reach);
        const cy = at[1] + d.y * (gap + reach);
        const box = { minX: cx - w / 2, maxX: cx + w / 2, minY: cy - h / 2, maxY: cy + h / 2 };
        fallback ??= box;
        if (!blocked(box)) {
          placed.push(box);
          return { tone, text, x: box.minX, y: box.minY, w, h, at };
        }
      }
    }
    if (!fallback) return null;
    placed.push(fallback);
    return { tone, text, x: fallback.minX, y: fallback.minY, w, h, at };
  };
  // The tip nearest the member first: it takes the place closest in, the others go further out
  const order = [...readings].sort(
    (a, b) =>
      Math.hypot(a.mark.to[0] - a.mark.from[0], a.mark.to[1] - a.mark.from[1]) -
      Math.hypot(b.mark.to[0] - b.mark.from[0], b.mark.to[1] - b.mark.from[1])
  );
  let sides = 0;
  const byReading = new Map<(typeof readings)[number], ReadoutTag>();
  for (const reading of order) {
    const { mark, text } = reading;
    const dx = mark.to[0] - mark.from[0];
    const dy = mark.to[1] - mark.from[1];
    const l = Math.hypot(dx, dy);
    const out = l > 1 ? { x: dx / l, y: dy / l } : normal;
    sides += out.x * normal.x + out.y * normal.y >= 0 ? 1 : -1;
    // Its own way out first; the other way only when that leaves the view
    const tag = put(text, mark.tone, mark.to, [out, { x: -out.x, y: -out.y }]);
    if (tag) byReading.set(reading, tag);
  }
  // In the order given, whichever went first
  const tags = readings.flatMap((r) => {
    const tag = byReading.get(r);
    return tag ? [tag] : [];
  });
  if (caption) {
    // The side of the member the fewest values took, then the other
    const first = sides > 0 ? { x: -normal.x, y: -normal.y } : normal;
    const tag = put(caption, 'muted', pointer, [first, { x: -first.x, y: -first.y }]);
    if (tag) tags.push(tag);
  }
  return tags;
};
