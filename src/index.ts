export { default as StructurePlot } from './components/StructurePlot.vue';
export { default as DiagramStack } from './components/DiagramStack.vue';
export { DEFAULT_COLORS, PLOT_CSS, toneVars, type PlotColors } from './components/theme';
export type {
  DiagramStackEmits,
  DiagramStackProps,
  StackReadout,
  StructurePlotEmits,
  StructurePlotProps,
} from './components/types';
export { EduBeamPlot } from './plugin';

export { modelFromSolver, type FromSolverOptions } from './core/fromSolver';
export * from './core/model';
export * from './core/polynomial';
export * from './core/units';
export {
  supportKind,
  supportPlacement,
  supportGlyph,
  glyphReach,
  type SupportKind,
  type SupportPlacement,
  type GlyphPart,
} from './core/supports';
export {
  buildStructureScene,
  defaultResultLayer,
  diagramScales,
  diagramSide,
  memberFrames,
  HATCH_SPACING_PX,
  PLOT_LAYERS,
  RESULT_LAYERS,
  type PlotLayer,
  type ResultLabelMode,
  type ResultLayer,
  type StructureSceneOptions,
  tipPlacements,
} from './core/structure';
export {
  fitScene,
  placeLabels,
  resolveScene,
  sceneBounds,
  project,
  type Anchor,
  type Fit,
  type FitBox,
  type SceneItem,
  type ResolvedScene,
  type Transform,
  type Tone,
} from './core/scene';
export {
  readMember,
  readoutAt,
  formatReadout,
  type Readout,
  type ReadoutQuantity,
  type SidedValue,
} from './core/readout';
export {
  beamLine,
  lineDiagram,
  lineModel,
  pointLoadAt,
  rowOutline,
  rowOrdinates,
  rowRange,
  rowPeaks,
  rowBreaks,
  type BeamLine,
  type LineMember,
  type RowPeak,
  type StackRow,
} from './core/stack';
