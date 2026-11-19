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
export { DEFAULT_PLOT_TEXTS, PLOT_TEXTS, usePlotTexts, type PlotTexts } from './components/texts';

export { modelFromSolver, type FromSolverOptions } from './core/fromSolver';
export { layoutStructure, alternativeResultGroups, type StructureLayout } from './core/layout';
export { structureSvg, PRINT_COLORS, type StructureSvgOptions } from './core/svg';
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
  isBarStructure,
  memberFrames,
  HATCH_SPACING_PX,
  DEFAULT_TEMPERATURE_SYMBOLS,
  PLOT_LAYERS,
  RESULT_LAYERS,
  type PlotLayer,
  type TemperatureSymbols,
  type ReactionLabels,
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
  type ResolvedPath,
  type ResolvedText,
  type ResolvedCircle,
  type ResolveOptions,
  type SceneText,
  type Bounds,
  type TextPlacement,
  type Transform,
  type Tone,
} from './core/scene';
export {
  readMember,
  readoutAt,
  readoutMarks,
  formatReadout,
  type Readout,
  type ReadoutMark,
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
