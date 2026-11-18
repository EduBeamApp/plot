/**
 * The plain-data model the drawing is made from. Everything is SI (m, N, N·m, N/m, K, rad) in the
 * solver's axes: x to the right, z down, rotations about y positive counter-clockwise on screen.
 * It is JSON-serialisable, so a page can solve at build time and ship only this.
 */
import type { Piecewise } from './polynomial';

export interface Fixity {
  readonly dx: boolean;
  readonly dz: boolean;
  readonly ry: boolean;
}

export interface PlotNode {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly fixity: Fixity;
  /** Rotation of the node's own axes (a rotated support), rad from x toward z: clockwise on screen. */
  readonly angle: number;
}

export interface PlotMember {
  readonly id: string;
  readonly start: string;
  readonly end: string;
  /** Moment releases at the start and end node. */
  readonly hinges: readonly [boolean, boolean];
}

/** A force per unit length, N/m, in global or member-local components. */
export interface LineIntensity {
  readonly fx: number;
  readonly fz: number;
}

export type PlotLoad =
  /** A force at a node, global components, N. */
  | { readonly kind: 'nodalForce'; readonly node: string; readonly fx: number; readonly fz: number }
  /** A moment at a node, N·m, positive counter-clockwise on screen. */
  | { readonly kind: 'nodalMoment'; readonly node: string; readonly my: number }
  /** Linearly varying load over the whole member; a uniform load has start equal to end. */
  | {
      readonly kind: 'distributed';
      readonly member: string;
      readonly start: LineIntensity;
      readonly end: LineIntensity;
      /** Components along the member's local x and z rather than the global axes. */
      readonly local: boolean;
    }
  /** A force on a member `at` metres from its start node. */
  | {
      readonly kind: 'pointForce';
      readonly member: string;
      readonly at: number;
      readonly fx: number;
      readonly fz: number;
      readonly local: boolean;
    }
  | { readonly kind: 'pointMoment'; readonly member: string; readonly at: number; readonly my: number }
  /** Temperature change, K: of the centroid, and bottom minus top fibres (ΔTb − ΔTt). */
  | { readonly kind: 'temperature'; readonly member: string; readonly uniform: number; readonly gradient: number }
  /** Imposed displacement of a support, in the node's axes: m and rad. */
  | {
      readonly kind: 'prescribed';
      readonly node: string;
      readonly dx?: number;
      readonly dz?: number;
      readonly ry?: number;
    };

export type PlotLoadKind = PlotLoad['kind'];

export type ReactionDof = 'dx' | 'dz' | 'ry';

export interface PlotReaction {
  readonly node: string;
  readonly dof: ReactionDof;
  /** Force on the structure along the node's axis, N (or N·m about y for `ry`). */
  readonly value: number;
}

/** Member results along local x in metres: forces in N and N·m, displacements in m. */
export interface MemberResults {
  /** Normal force, tension positive. */
  readonly N: Piecewise;
  /** Shear force. */
  readonly V: Piecewise;
  /** Bending moment, sagging (tension on the side of local +z) positive. */
  readonly M: Piecewise;
  /** Displacement along local x. */
  readonly u: Piecewise;
  /** Displacement along local z (down for a member drawn left to right). */
  readonly w: Piecewise;
}

export interface PlotResults {
  readonly members: Readonly<Record<string, MemberResults>>;
  readonly reactions: readonly PlotReaction[];
}

export interface PlotModel {
  readonly nodes: readonly PlotNode[];
  readonly members: readonly PlotMember[];
  readonly loads: readonly PlotLoad[];
  /** Absent until the structure is solved: the drawing then shows the model alone. */
  readonly results?: PlotResults;
}

export type InternalForce = 'N' | 'V' | 'M';

/** A member's axis on the model: where it starts, its unit tangent and its local z, and its length. */
export interface MemberFrame {
  readonly x: number;
  readonly z: number;
  /** Unit tangent, start to end. */
  readonly tx: number;
  readonly tz: number;
  /** Unit local z: the tangent turned 90° clockwise on screen - the side of the dashed fibres. */
  readonly nx: number;
  readonly nz: number;
  readonly length: number;
}

export const nodeMap = (model: PlotModel): ReadonlyMap<string, PlotNode> => new Map(model.nodes.map((n) => [n.id, n]));

export const memberFrame = (model: PlotModel, member: PlotMember, nodes = nodeMap(model)): MemberFrame => {
  const a = nodes.get(member.start);
  const b = nodes.get(member.end);
  if (!a || !b) throw new Error(`Member ${member.id} names a node that does not exist`);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 0)) throw new Error(`Member ${member.id} has zero length`);
  const tx = dx / length;
  const tz = dz / length;
  return { x: a.x, z: a.z, tx, tz, nx: -tz, nz: tx, length };
};

/** The point `at` metres along the member. */
export const pointAlong = (frame: MemberFrame, at: number): { x: number; z: number } => ({
  x: frame.x + frame.tx * at,
  z: frame.z + frame.tz * at,
});
