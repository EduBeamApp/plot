/**
 * Colours and the few rules a plot needs. Colours come from the page's custom properties - the
 * names the EduBeam website already defines - so its light and dark themes apply as they are;
 * system colours stand in on a page that defines none.
 */
import type { Tone } from '../core/scene';

export type PlotColors = Record<Tone | 'paper', string>;

export const DEFAULT_COLORS: PlotColors = {
  // The site's softened figure ink first (its dark theme tones members down), then its text ink
  ink: 'var(--figure-ink, var(--ink, CanvasText))',
  paper: 'var(--paper, Canvas)',
  muted: 'var(--muted, GrayText)',
  brand: 'var(--brand, #4f46e5)',
  normal: 'var(--color-normal, #2222ff)',
  shear: 'var(--color-shear, #00af00)',
  moment: 'var(--color-moment, #ff2222)',
  deformed: 'var(--figure-ink, var(--ink, CanvasText))',
  load: 'var(--color-load, #ff8700)',
  reaction: 'var(--color-reaction, #a020f0)',
  // Axial forces by sign: tension red, compression blue
  tension: 'var(--color-tension, var(--color-moment, #ff2222))',
  compression: 'var(--color-compression, var(--color-normal, #2222ff))',
};

/** Custom properties for the root element: the defaults, with any colour the caller overrides. */
export const toneVars = (colors?: Partial<PlotColors>): Record<string, string> =>
  Object.fromEntries(Object.entries({ ...DEFAULT_COLORS, ...colors }).map(([tone, value]) => [`--ebp-${tone}`, value]));

/**
 * Inlined into each SVG rather than shipped as a stylesheet, so a plot needs no CSS import and
 * renders the same on the server. Its colours stay CSS custom properties of the page: for a file,
 * use `structureSvg`. Every class is `ebp-` prefixed; a page can restyle them, e.g. the timing.
 */
export const PLOT_CSS = `
.ebp-svg{display:block;max-width:100%;height:auto;overflow:visible;font-family:var(--ebp-font,var(--font-sans,inherit));font-variant-numeric:tabular-nums;-webkit-user-select:none;user-select:none}
.ebp-svg text{paint-order:stroke;stroke:var(--ebp-paper);stroke-width:4px;stroke-linejoin:round}
.ebp-svg text.ebp-nohalo{stroke:none}
.ebp-svg .ebp-math{font-family:KaTeX_Main,'Latin Modern Roman',Georgia,serif}
.ebp-svg .ebp-math tspan.ebp-var{font-family:KaTeX_Math,'Latin Modern Math',Georgia,serif;font-style:italic}
.ebp-layer{opacity:0}
.ebp-layer.ebp-on{opacity:1}
.ebp-draw{stroke-dasharray:1;stroke-dashoffset:1}
.ebp-on .ebp-draw{stroke-dashoffset:0}
.ebp-animate .ebp-layer{transition:opacity .45s ease}
.ebp-animate .ebp-draw{transition:stroke-dashoffset .6s cubic-bezier(.22,1,.36,1)}
.ebp-handle{cursor:grab;outline:none}
.ebp-handle.ebp-dragging{cursor:grabbing}
.ebp-animate .ebp-grip,.ebp-stack .ebp-grip{transition:r .15s}
.ebp-handle:hover .ebp-grip,.ebp-handle:focus-visible .ebp-grip,.ebp-handle.ebp-dragging .ebp-grip{r:11px}
.ebp-handle:focus-visible .ebp-grip{stroke:var(--ebp-paper);stroke-width:3}
.ebp-focus-ring{opacity:0}
.ebp-handle:focus-visible .ebp-focus-ring{opacity:1}
@media (prefers-reduced-motion:reduce){.ebp-stack .ebp-grip{transition:none}}
@media (prefers-reduced-motion:reduce){.ebp-animate .ebp-layer,.ebp-animate .ebp-draw{transition:none}}
`.trim();
