/**
 * Laying a structure out in a box: the one routine behind both `StructurePlot` and `structureSvg`,
 * so a figure on a page and the same figure saved as a file are drawn alike.
 */
import type { PlotModel } from './model';
import {
  fitScene,
  placeLabels,
  resolveScene,
  type Fit,
  type FitBox,
  type ResolvedScene,
  type SceneItem,
} from './scene';
import {
  buildStructureScene,
  RESULT_LAYERS,
  type PlotLayer,
  type ReactionLabels,
  type ResultLabelMode,
  type StructureSceneOptions,
} from './structure';

export interface StructureLayout {
  readonly fit: Fit;
  readonly items: readonly SceneItem[];
  readonly resolved: ResolvedScene;
}

/** Results shown one at a time make room for each other's labels but never fight over places. */
export const alternativeResultGroups = (shown: ReadonlySet<PlotLayer>): ReadonlySet<string> =>
  RESULT_LAYERS.filter((q) => shown.has(q)).length > 1 ? new Set() : new Set(RESULT_LAYERS);

/**
 * Fit with every label, see which survive, then fit again on those: a label that is dropped for
 * crowding does not shrink the structure. The last pass may bring back any label that now fits.
 *
 * `options.layers` are the layers laid out (everything that may be shown); `shown` those on show.
 * `labelModes` are the label styles to make room for, so switching between them moves nothing;
 * `reactionLabels` the same for the reactions' names and values (an exercise and its solution).
 */
export const layoutStructure = (
  model: PlotModel,
  options: Omit<StructureSceneOptions, 'scale'>,
  box: FitBox,
  shown: ReadonlySet<PlotLayer> = options.layers,
  labelModes: readonly ResultLabelMode[] = [options.resultLabelMode ?? 'horizontal'],
  reactionLabels: readonly ReactionLabels[] = []
): StructureLayout => {
  const fontSize = box.fontSize;
  const alternativeGroups = alternativeResultGroups(shown);
  const scene = (scale: number, mode = options.resultLabelMode, reactions = options.reactionLabels): SceneItem[] =>
    buildStructureScene(model, { ...options, resultLabelMode: mode, reactionLabels: reactions, scale });
  const fitItems = (mode: ResultLabelMode, reactions: ReactionLabels): SceneItem[] => {
    const first = scene(1, mode, reactions);
    // No shields while fitting: which diagram is on show must not change the fit
    const kept = placeLabels(first, fitScene(first, box), { fontSize, alternativeGroups, shields: new Set() });
    return first.flatMap((item): SceneItem[] => {
      if (item.kind !== 'text') return [item];
      const placed = kept.get(item);
      return placed ? [placed] : [];
    });
  };
  const modes = [...new Set([options.resultLabelMode ?? 'horizontal', ...labelModes])];
  const reactionModes = [...new Set([options.reactionLabels ?? 'values', ...reactionLabels])];
  const fit = fitScene(
    modes.flatMap((mode) => reactionModes.flatMap((reactions) => fitItems(mode, reactions))),
    box
  );
  const items = scene(fit.s);
  const shields = new Set<string>(RESULT_LAYERS.filter((q) => shown.has(q)));
  return { fit, items, resolved: resolveScene(items, fit, { fontSize, viewport: fit, alternativeGroups, shields }) };
};
