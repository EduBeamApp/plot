/**
 * The components' props and events, exported so a page can type its own wrappers around them.
 */
import type { Solver } from '@edubeam/fem';
import type { PlotModel } from '../core/model';
import type { Readout } from '../core/readout';
import type { StackRow } from '../core/stack';
import type { PlotLayer, ReactionLabels, ResultLabelMode, ResultLayer } from '../core/structure';
import type { Units } from '../core/units';
import type { PlotColors } from './theme';

export interface StructurePlotProps {
  /** A ts-fem solver; solved, to show results. Pass a new one (or bump `revision`) after a change. */
  solver?: Solver;
  /** Or the plain data `modelFromSolver` makes, e.g. prepared at build time. */
  model?: PlotModel;
  loadCase?: number;
  /** Change it to redraw a solver that was changed in place. */
  revision?: number;
  /** What to draw. Default: members, supports, loads, reactions and one result chosen for the structure. */
  layers?: readonly PlotLayer[];
  /** What to make room for; defaults to `layers`. Give the last stage's layers for a figure that builds up. */
  reserve?: readonly PlotLayer[];
  /** Thumbnail drawing: smaller symbols, two values per member at most, magnitudes only. */
  compact?: boolean;
  units?: Partial<Units>;
  numberFormat?: Intl.NumberFormat;
  colors?: Partial<PlotColors>;
  /** Width before the box is measured (server rendering), px. */
  width?: number;
  /** Fixed height, px. Without it the height follows the drawing, up to `maxHeight`. */
  height?: number;
  maxHeight?: number;
  padding?: number;
  fontSize?: number;
  /** Largest diagram ordinate, px. */
  diagramSize?: number;
  /** Largest displacement on the deformed shape, px. */
  deformedSize?: number;
  /** px per SI unit for a result, to draw several plots at one scale. */
  diagramScale?: Partial<Record<ResultLayer, number>>;
  momentOnTensionSide?: boolean;
  /** Values upright, or turned to run along their ordinate across the member (`axis`), as in the app. */
  resultLabelMode?: ResultLabelMode;
  /**
   * `names` draws the reactions as the unknowns of an exercise: an arrow for every restrained
   * direction, pointing the way it counts as positive, named (A with subscript x) instead of sized.
   */
  reactionLabels?: ReactionLabels;
  /**
   * Label styles to make room for besides the current one, so switching `resultLabelMode` moves
   * only the labels, not the drawing - as `reserve` does for layers.
   */
  reserveLabelModes?: readonly ResultLabelMode[];
  /**
   * Reaction label styles to make room for besides `reactionLabels`, so an exercise that turns into
   * its solution (`'names'` to `'values'`) keeps its drawing where it is.
   */
  reserveReactionLabels?: readonly ReactionLabels[];
  /** Fade layers in and draw members on. Always off under prefers-reduced-motion. */
  animate?: boolean;
  /** Read values off the members under the pointer. Off, the plot takes no pointer input at all. */
  hover?: boolean;
  /** Accessible name. */
  title?: string;
}

export interface StructurePlotEmits {
  /** The member point under the pointer and its results there, with `hover`; null when it leaves. */
  readout: [value: Readout | null];
}

/** One row's value at the cursor: either side of a step, equal elsewhere (SI units). */
export interface StackReadout {
  /** Metres along the beam line. */
  readonly x: number;
  readonly values: Partial<Record<StackRow, { readonly left: number; readonly right: number }>>;
}

export interface DiagramStackProps {
  solver?: Solver;
  model?: PlotModel;
  loadCase?: number;
  revision?: number;
  /** The members of the beam line; all members by default. They must form one horizontal line. */
  members?: readonly string[];
  /** Diagram rows, top to bottom. */
  rows?: readonly StackRow[];
  /** The beam with its supports, loads and reactions above the rows. */
  loadRow?: boolean;
  /** Value range (SI) per row, to keep a row's scale while a load moves; by default each row's own. */
  ranges?: Partial<Record<StackRow, readonly [number, number]>>;
  /** Row heights, px, before scaling to `maxHeight`. */
  rowHeights?: Partial<Record<StackRow, number>>;
  /** Rows shrink (to 60 % at most) so the whole figure fits this height. Text keeps its size. */
  maxHeight?: number;
  units?: Partial<Units>;
  numberFormat?: Intl.NumberFormat;
  colors?: Partial<PlotColors>;
  /** Width before the box is measured (server rendering), px. */
  width?: number;
  fontSize?: number;
  /** Read the rows under the pointer. Off, the figure takes no pointer input. */
  hover?: boolean;
  /** Line position (m) of a point load the reader may drag; leave out for a fixed figure. */
  loadAt?: number;
  /** Text beside the draggable load; by default "P = …". */
  loadLabel?: string;
  /** The drag rounds to this step, m; arrow keys move by it. */
  loadStep?: number;
  title?: string;
}

export interface DiagramStackEmits {
  /** The draggable load's new position, metres along the line: `v-model:load-at`. */
  'update:loadAt': [at: number];
  /** The cursor's values across the rows; null when the pointer leaves. */
  readout: [value: StackReadout | null];
}
