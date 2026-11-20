/**
 * A structure plot as a standalone SVG file: plain colours and attributes only, no CSS custom
 * properties or stylesheet, so Word, LaTeX (via Inkscape or svg2pdf), Inkscape itself and cairosvg
 * draw it exactly as the page does.
 */
import { layoutStructure } from './layout';
import type { PlotModel } from './model';
import {
  SUB_DROP,
  SUB_SCALE,
  type ResolvedCircle,
  type ResolvedPath,
  type ResolvedScene,
  type ResolvedText,
  type Tone,
} from './scene';
import {
  defaultResultLayer,
  PLOT_LAYERS,
  type PlotLayer,
  type ReactionLabels,
  type ResultLabelMode,
  type TemperatureSymbols,
} from './structure';
import { DEFAULT_NUMBER_FORMAT, resolveUnits, type Units } from './units';

/** Concrete colours for a file that has no page around it: the EduBeam app's, on white. */
export const PRINT_COLORS: Readonly<Record<Tone | 'paper', string>> = {
  ink: '#16182b',
  paper: '#ffffff',
  muted: '#6b7085',
  brand: '#4f46e5',
  normal: '#2222ff',
  shear: '#00af00',
  moment: '#ff2222',
  deformed: '#16182b',
  load: '#ff8700',
  reaction: '#a020f0',
  tension: '#ff2222',
  compression: '#2222ff',
};

export interface StructureSvgOptions {
  /** Layers to draw. Default: members, supports, loads, reactions and the result `StructurePlot` picks. */
  readonly layers?: readonly PlotLayer[];
  /**
   * Layers to make room for besides `layers`, as `StructurePlot`'s `reserve`: give every stage of a
   * build-up the last stage's layers, and the files line up when laid over each other (Beamer overlays).
   */
  readonly reserve?: readonly PlotLayer[];
  /** Label styles to make room for besides `resultLabelMode`. */
  readonly reserveLabelModes?: readonly ResultLabelMode[];
  /** Reaction label styles to make room for besides `reactionLabels`, so a sheet and its key line up. */
  readonly reserveReactionLabels?: readonly ReactionLabels[];
  /** Width of the drawing, px (the SVG's user units). Default 640. */
  readonly width?: number;
  /** Fixed height, px; by default the height follows the drawing, up to `maxHeight`. */
  readonly height?: number;
  readonly maxHeight?: number;
  readonly padding?: number;
  readonly fontSize?: number;
  /** Any font stack the program opening the file knows. */
  readonly fontFamily?: string;
  readonly compact?: boolean;
  readonly units?: Partial<Units>;
  readonly numberFormat?: Intl.NumberFormat;
  /** The temperature load's symbols, `ΔT` and `ΔTb − ΔTt` unless given */
  readonly temperatureSymbols?: TemperatureSymbols;
  readonly colors?: Partial<Record<Tone | 'paper', string>>;
  readonly diagramSize?: number;
  readonly deformedSize?: number;
  readonly momentOnTensionSide?: boolean;
  readonly resultLabelMode?: ResultLabelMode;
  /** `names` draws the reactions as an exercise's unknowns, as `StructurePlot`'s `reactionLabels`. */
  readonly reactionLabels?: ReactionLabels;
  /** Paint the background in `paper`; off leaves it transparent. Default on. */
  readonly background?: boolean;
  /** Accessible name, written as the SVG's `<title>`. */
  readonly title?: string;
}

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const round = (v: number): number => Math.round(v * 100) / 100;

const attrs = (pairs: Record<string, string | number | undefined>): string =>
  Object.entries(pairs)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
    .join(' ');

/**
 * The plot of a model as the text of a standalone `.svg` file, laid out as `StructurePlot` lays it
 * out. Labels carry their halo as a separate text drawn underneath, for programs that ignore
 * `paint-order`.
 */
export const structureSvg = (model: PlotModel, options: StructureSvgOptions = {}): string => {
  const fontSize = options.fontSize ?? (options.compact ? 11.5 : 13);
  const width = options.width ?? 640;
  const result = defaultResultLayer(model);
  const layers = new Set<PlotLayer>(
    options.layers ?? ['members', 'supports', 'loads', 'reactions', ...(result ? [result] : [])]
  );
  const laidOut = new Set<PlotLayer>([...layers, ...(options.reserve ?? [])]);
  const { fit, resolved: all } = layoutStructure(
    model,
    {
      layers: laidOut,
      compact: options.compact ?? false,
      units: resolveUnits(options.units),
      numberFormat: options.numberFormat ?? DEFAULT_NUMBER_FORMAT,
      diagramSize: options.diagramSize ?? (options.compact ? 26 : 48),
      deformedSize: options.deformedSize ?? (options.compact ? 18 : 30),
      momentOnTensionSide: options.momentOnTensionSide ?? true,
      resultLabelMode: options.resultLabelMode ?? 'horizontal',
      reactionLabels: options.reactionLabels,
      temperatureSymbols: options.temperatureSymbols,
      fontSize,
    },
    {
      width,
      height: options.height,
      maxHeight: options.maxHeight ?? Math.max(320, width * 0.75),
      padding: options.padding ?? 6,
      fontSize,
    },
    layers,
    options.reserveLabelModes,
    options.reserveReactionLabels
  );
  // Only what is shown is written; the reserved layers only took their room
  const shown: ReadonlySet<string> = layers;
  const resolved = {
    paths: all.paths.filter((p) => shown.has(p.group)),
    circles: all.circles.filter((o) => shown.has(o.group)),
    texts: all.texts.filter((t) => shown.has(t.group)),
  };
  return sceneSvg(resolved, fit, {
    colors: options.colors,
    fontSize,
    fontFamily: options.fontFamily,
    background: options.background,
    title: options.title,
  });
};

export interface SceneSvgOptions {
  readonly colors?: Partial<Record<Tone | 'paper', string>>;
  /** The labels' size where a label has none of its own, px. Default 13. */
  readonly fontSize?: number;
  readonly fontFamily?: string;
  /** Paint the background in `paper`; off leaves it transparent. Default on. */
  readonly background?: boolean;
  /** Accessible name, written as the SVG's `<title>`. */
  readonly title?: string;
}

/** How a scene's shapes and labels are written: its colours and its labels' size. */
export type SceneMarkupOptions = Pick<SceneSvgOptions, 'colors' | 'fontSize'>;

/**
 * A scene already laid out, as SVG markup without the root element: its shapes layer by layer in
 * paint order, then every label, each with its halo as a text of its own underneath (for programs
 * that ignore `paint-order`). For an application that places the drawing in an SVG of its own.
 */
export const sceneMarkup = (
  resolved: Pick<ResolvedScene, 'paths' | 'circles' | 'texts'>,
  options: SceneMarkupOptions = {}
): string => {
  const fontSize = options.fontSize ?? 13;
  const colors = { ...PRINT_COLORS, ...options.colors };
  const c = (tone: Tone | 'paper') => colors[tone];
  const path = (p: ResolvedPath) =>
    `<path ${attrs({
      d: p.d,
      fill: p.fill === 'tone' ? c(p.tone) : p.fill === 'paper' ? c('paper') : 'none',
      'fill-opacity': p.fillOpacity,
      stroke: p.width > 0 ? c(p.tone) : 'none',
      'stroke-width': p.width > 0 ? p.width : undefined,
      'stroke-opacity': p.opacity,
      'stroke-dasharray': p.dash,
      'stroke-linecap': p.cap ?? 'round',
      'stroke-linejoin': 'round',
    })}/>`;
  const circle = (o: ResolvedCircle) =>
    `<circle ${attrs({
      cx: o.cx,
      cy: o.cy,
      r: o.r,
      stroke: c(o.tone),
      'stroke-width': o.width,
      fill: o.fill === 'paper' ? c('paper') : c(o.tone),
    })}/>`;
  // The halo is a text of its own underneath, for programs that ignore `paint-order`
  const text = (t: ResolvedText) => {
    const common = {
      x: t.x,
      y: t.y,
      'text-anchor': t.anchor,
      'font-size': t.size ?? fontSize,
      'font-weight': t.weight,
      'font-style': t.italic ? 'italic' : undefined,
      transform: t.transform,
    };
    // A subscript as a tspan with plain numbers, which Word and Inkscape both read
    const textSize = t.size ?? fontSize;
    const content =
      escapeXml(t.text) +
      (t.sub
        ? `<tspan ${attrs({ 'font-size': round(textSize * SUB_SCALE), dy: round(textSize * SUB_DROP) })}>${escapeXml(t.sub)}</tspan>`
        : '');
    return [
      `<text ${attrs({ ...common, fill: c('paper'), stroke: c('paper'), 'stroke-width': 4, 'stroke-linejoin': 'round' })}>${content}</text>`,
      `<text ${attrs({ ...common, fill: c(t.tone) })}>${content}</text>`,
    ];
  };
  // Layer by layer in paint order, every label on top: as the component paints
  const shapes = PLOT_LAYERS.flatMap((layer) => [
    ...resolved.paths.filter((p) => p.group === layer && !p.hitArea).map(path),
    ...resolved.circles.filter((o) => o.group === layer).map(circle),
  ]);
  const labels = PLOT_LAYERS.flatMap((layer) => resolved.texts.filter((t) => t.group === layer).flatMap(text));

  return [...shapes, ...labels].join('\n');
};

/**
 * A scene already laid out, as the text of a standalone `.svg` file of the given size: for an
 * application that lays a structure out its own way and saves it as `structureSvg` saves its own.
 */
export const sceneSvg = (
  resolved: Pick<ResolvedScene, 'paths' | 'circles' | 'texts'>,
  size: { readonly width: number; readonly height: number },
  options: SceneSvgOptions = {}
): string => {
  const paper = { ...PRINT_COLORS, ...options.colors }.paper;
  const svg = attrs({
    xmlns: 'http://www.w3.org/2000/svg',
    width: size.width,
    height: size.height,
    viewBox: `0 0 ${size.width} ${size.height}`,
    'font-family': options.fontFamily ?? 'Helvetica, Arial, sans-serif',
  });
  return [
    `<svg ${svg}>`,
    ...(options.title ? [`<title>${escapeXml(options.title)}</title>`] : []),
    ...(options.background === false ? [] : [`<rect width="100%" height="100%" fill="${paper}"/>`]),
    sceneMarkup(resolved, options),
    '</svg>',
    '',
  ].join('\n');
};
