/**
 * The few words the components say for themselves, to screen readers: the figure's accessible name,
 * a diagram stack's, and the movable load's slider. English unless an app provides its own:
 * `app.provide(PLOT_TEXTS, { structure: (layers) => … })`, or a ref of such an object to follow a
 * language switch. A page's `title` prop still wins over `structure`.
 */
import { computed, inject, unref, type ComputedRef, type InjectionKey, type Ref } from 'vue';
import { DEFAULT_TEMPERATURE_SYMBOLS, type PlotLayer, type TemperatureSymbols } from '../core/structure';

export interface PlotTexts {
  /** A structure plot's accessible name, from the layers it shows, in paint order. */
  readonly structure: (shown: readonly PlotLayer[]) => string;
  /** A diagram stack's accessible name, from the rows it shows beneath the beam. */
  readonly stack: (rows: readonly ('N' | 'V' | 'M' | 'w')[]) => string;
  /** The temperature load's symbols drawn on a figure, as the app the figure belongs to writes them. */
  readonly temperature: TemperatureSymbols;
  /** The movable load's slider, named after the load's own label ("20 kN"). */
  readonly loadHandle: (load: string) => string;
  /** The slider's position in words, the distance already formatted ("3.20"). */
  readonly loadPosition: (metres: string) => string;
}

const LAYER_WORDS: Partial<Record<PlotLayer, string>> = {
  N: 'normal force',
  V: 'shear force',
  M: 'bending moment',
  w: 'deformed shape',
  reactions: 'reactions',
  loads: 'loads',
};

export const DEFAULT_PLOT_TEXTS: PlotTexts = {
  structure: (shown) => {
    const parts = shown.flatMap((l) => LAYER_WORDS[l] ?? []);
    return parts.length > 0 ? `Structure with its ${parts.join(', ')}` : 'Structure';
  },
  stack: (rows) => {
    const words = { N: 'normal force', V: 'shear force', M: 'bending moment', w: 'deflection' } as const;
    return `A beam with its loads${rows.length ? `, and its ${rows.map((r) => words[r]).join(', ')} beneath` : ''}`;
  },
  temperature: DEFAULT_TEMPERATURE_SYMBOLS,
  loadHandle: (load) => `Position of the load ${load}`,
  loadPosition: (metres) => `${metres} m from the start of the beam`,
};

export const PLOT_TEXTS: InjectionKey<Partial<PlotTexts> | Ref<Partial<PlotTexts>>> = Symbol('edubeam-plot-texts');

/** The texts in effect: the app's where it gives them, English for the rest. */
export const usePlotTexts = (): ComputedRef<PlotTexts> => {
  const provided = inject(PLOT_TEXTS, null);
  return computed(() => ({ ...DEFAULT_PLOT_TEXTS, ...unref(provided) }));
};
