# @edubeam/plot

Vue 3 components that draw plane structures and their analysis results as SVG: members, supports, loads, reactions,
the normal force, shear force and bending moment diagrams, and the deformed shape. The structure is solved by
[ts-fem](https://github.com/janvorisek/ts-fem), the finite element solver behind [EduBeam](https://www.edubeam.app).

Documentation and live examples: <https://www.edubeam.app/plot>

<!-- TODO: add screenshots once they have a public URL to load from. -->

- **`StructurePlot`** draws any plane frame, beam or truss, fitted to the width of its box. A compact mode makes
  readable thumbnails, and independent layers let a figure build up step by step without moving.
- **`DiagramStack`** draws the stacked textbook figure: a beam with its loads, and its V(x), M(x) and w(x) diagrams
  beneath it on one x axis. It has a reading cursor and an optional point load the reader can drag.
- **Exact results.** Each member's internal forces and deflection are stored as the polynomials they are, split at
  point loads. Steps are drawn as true verticals, extremes are found exactly, and curves are drawn as exact Béziers.
- **Real pixel sizes.** Text, symbols and line weights stay the same size whatever the size of the model, so a plot
  stays legible on a phone.
- **Standalone.** It needs only Vue and ts-fem, with no UI framework, store or i18n library. Colours come from CSS
  custom properties, so it follows the page's light and dark themes.

## Install

`vue` (3.5 or later) and `ts-fem` are peer dependencies.

ts-fem is not published on npm yet, so install it from GitHub, in the same command as this package:

```sh
npm install @edubeam/plot vue github:janvorisek/ts-fem
```

Installing `@edubeam/plot` on its own fails for now. npm 7 and later install peer dependencies automatically, and
there is no `ts-fem` on the npm registry for it to find. Once ts-fem is on npm, a plain `npm install @edubeam/plot`
will do.

The package is ESM only and ships its own TypeScript types. It needs no stylesheet import: the few CSS rules a plot
uses are inlined into each SVG.

## Quick start

Build and solve a model with ts-fem (SI units throughout: m, N, Pa), then hand the solver to a component:

```vue
<script setup lang="ts">
import { markRaw } from 'vue';
import { DofID, LinearStaticSolver } from 'ts-fem';
import { DiagramStack, StructurePlot } from '@edubeam/plot';

// A 6 m simply supported beam under 12 kN/m
const solver = new LinearStaticSolver();
solver.domain.createMaterial(1, { e: 210e9, g: 81e9, alpha: 12e-6, d: 7850 });
solver.domain.createCrossSection(1, { a: 28.5e-4, iy: 1943e-8, h: 0.2, k: 1 });
solver.domain.createNode(1, [0, 0, 0], [DofID.Dx, DofID.Dz]); // pin
solver.domain.createNode(2, [6, 0, 0], [DofID.Dz]); // roller
solver.domain.createBeam2D(1, [1, 2], 1, 1);
solver.loadCases[0].createBeamElementUniformEdgeLoad(1, [0, 12e3], true); // 12 kN/m, downward
solver.solve();

// The solver is read, never watched: markRaw keeps Vue from making it deeply reactive.
const beam = markRaw(solver);
</script>

<template>
  <StructurePlot :solver="beam" :layers="['members', 'supports', 'loads', 'reactions', 'M']" />
  <DiagramStack :solver="beam" />
</template>
```

The plot shows the 36 kN reactions and the 54 kNm moment at mid-span, hanging below the beam on the tension side.

The model follows ts-fem's axes: x to the right, z down. A downward load is a positive `fz`, and a sagging moment is
positive. After changing a solver in place, pass a new one or bump the `revision` prop to redraw.

## StructurePlot

```vue
<StructurePlot :solver="solver" compact :height="200" />
<StructurePlot :model="model" :layers="['members', 'supports', 'N']" result-label-mode="axis" />
```

The plot measures its container with a `ResizeObserver` and lays out at that width, in real pixels. Without a fixed
`height`, the height follows the drawing, up to `maxHeight`.

### Props

| Prop                  | Type                                   | Default                                | Description                                                                                                                       |
| --------------------- | -------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `solver`              | ts-fem `Solver`                        | none                                   | A ts-fem solver. Results are drawn once its load case is solved.                                                                  |
| `model`               | `PlotModel`                            | none                                   | Or the plain data `modelFromSolver` makes, for example prepared at build time. Takes precedence over `solver`.                    |
| `loadCase`            | `number`                               | `0`                                    | Index into `solver.loadCases`.                                                                                                    |
| `revision`            | `number`                               | `0`                                    | Change it to redraw a solver that was changed in place.                                                                           |
| `layers`              | `PlotLayer[]`                          | see below                              | What to draw.                                                                                                                     |
| `reserve`             | `PlotLayer[]`                          | `layers`                               | Layers to make room for. See [Layers and reserve](#layers-and-reserve).                                                           |
| `compact`             | `boolean`                              | `false`                                | Thumbnail drawing. See [Compact mode](#compact-mode).                                                                             |
| `resultLabelMode`     | `'horizontal' \| 'axis'`               | `'horizontal'`                         | Diagram values upright, or turned to run along their ordinate, across the member.                                                 |
| `reserveLabelModes`   | `ResultLabelMode[]`                    | none                                   | Label modes to make room for besides the current one, so switching `resultLabelMode` moves only the labels.                       |
| `momentOnTensionSide` | `boolean`                              | `true`                                 | M on the tension side, as drawn in most of Europe. `false` draws it on the compression side.                                      |
| `units`               | `Partial<Units>`                       | kN, kNm, kN/m, m, mm, mrad, K          | Display units. See [Units and number formats](#units-and-number-formats).                                                         |
| `numberFormat`        | `Intl.NumberFormat`                    | English, at most one decimal           | Formats every number.                                                                                                             |
| `colors`              | `Partial<PlotColors>`                  | none                                   | Colour overrides. See [Theming](#theming).                                                                                        |
| `width`               | `number`                               | `640`, compact `400`                   | Width in px before the box is measured, used when rendering on the server.                                                        |
| `height`              | `number`                               | none                                   | Fixed height in px.                                                                                                               |
| `maxHeight`           | `number`                               | `max(320, 0.75 × width)`, compact none | Upper bound for the automatic height.                                                                                             |
| `padding`             | `number`                               | `6`                                    | Space around the drawing, px.                                                                                                     |
| `fontSize`            | `number`                               | `13`, compact `11.5`                   | Text size, px.                                                                                                                    |
| `diagramSize`         | `number`                               | `48`, compact `26`                     | Length of the largest diagram ordinate, px.                                                                                       |
| `deformedSize`        | `number`                               | `30`, compact `18`                     | Largest displacement on the deformed shape, px.                                                                                   |
| `diagramScale`        | `Partial<Record<ResultLayer, number>>` | none                                   | Fixed px per SI unit for a result, to draw several plots at one scale. Overrides `diagramSize` or `deformedSize` for that result. |
| `animate`             | `boolean`                              | `true`                                 | Fade layers in and draw members from end to end when they appear. Always off under `prefers-reduced-motion`.                      |
| `hover`               | `boolean`                              | `false`                                | Read values off the member under the pointer. See [Reading values](#reading-values).                                              |
| `title`               | `string`                               | a description of what is shown         | Accessible name of the figure.                                                                                                    |

### Layers and reserve

A layer is one of `nodes`, `nodeLabels`, `dimensions`, `members`, `supports`, `loads`, `reactions`, and the results
`N`, `V`, `M` and `w` (the deformed shape).

Without `layers`, a plot draws members, supports, loads and reactions, plus one result chosen for the structure:

- `M` for beams and frames
- `N` for a truss, where every member is pinned at both ends or bending is negligible beside the axial forces
- `w` when nothing carries a force, as in a beam free to expand under a temperature load

The fit is computed for every layer in `reserve` as well as those in `layers`. Layers that are reserved but not shown
are drawn hidden. So a figure that builds up in stages keeps its layout, and each new layer fades in where it belongs:

```vue
<script setup lang="ts">
const stages: PlotLayer[][] = [
  ['nodes', 'nodeLabels', 'dimensions'],
  ['nodes', 'nodeLabels', 'members'],
  ['nodes', 'nodeLabels', 'members', 'supports', 'loads'],
  ['nodes', 'nodeLabels', 'members', 'supports', 'loads', 'reactions', 'M'],
];
const all = [...new Set(stages.flat())];
</script>

<template>
  <StructurePlot :solver="frame" :layers="stages[step]" :reserve="all" />
</template>
```

Each layer is a `<g class="ebp-layer ebp-layer-{name}">`, and gets `ebp-on` when shown. The transitions are plain CSS
on those classes, so a page can restyle them.

### Diagram values

Every value is written just beyond the tip of the ordinate it denotes:

- An extreme of a member's diagram is labelled.
- A rigid corner is labelled once, at the tip of the member with more room around it.
- A step, under a point load or over a support, shows both its values.
- A truss shows each bar's force once, along the bar, coloured by sign: tension and compression.

A label that would overlap another label, a member or an arrow tries other places at the same tip. If none is free,
the label is left out, and the fit never reserves room for labels that were left out. Truss bar forces are the
exception, because a reader cannot work out a missing one. A bar force slides along its bar, flips to the other side,
shrinks to 10 px and drops its unit, in that order, before it is ever left out.

With `resultLabelMode="axis"`, values are turned to run along their ordinates, as the EduBeam app draws them. Give
`reserveLabelModes` (for example `['horizontal', 'axis']`) when the reader can switch modes, so the drawing doesn't
move when they do.

### Compact mode

For thumbnails and gallery tiles of about 400 × 200 px:

- smaller symbols and 11.5 px text
- at most two values per member, the largest
- loads and reactions as arrows with their magnitudes

The default layers still apply, so a tile shows one result.

### Reading values

With `hover`, the plot shows the values of the shown results at the member point under the pointer. A pill reads, for
example, `M = 54 kNm`. At a step it shows both sides: `V = 13.3 → −6.7 kN`.

The `readout` event carries the same values as data: `{ member, x, px, py, values }`, where each of `values.N`, `V`,
`M` and `w` is `{ left, right }` in SI units. The event sends `null` when the pointer leaves.

## DiagramStack

```vue
<script setup lang="ts">
const at = ref(3.2);
const solver = computed(() => markRaw(solveBeamWithLoadAt(at.value)));
</script>

<template>
  <DiagramStack v-model:load-at="at" :solver="solver" :ranges="envelope" />
</template>
```

The members must form one horizontal line, drawn left to right. Any other line is refused with an error, because the
figure's x axis is the beam's.

### Props

| Prop           | Type                               | Default                                        | Description                                                                             |
| -------------- | ---------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| `solver`       | ts-fem `Solver`                    | none                                           | The solved beam.                                                                        |
| `model`        | `PlotModel`                        | none                                           | Or plain data from `modelFromSolver`.                                                   |
| `loadCase`     | `number`                           | `0`                                            | Index into `solver.loadCases`.                                                          |
| `revision`     | `number`                           | `0`                                            | Change it to redraw a solver that was changed in place.                                 |
| `members`      | `string[]`                         | all members                                    | The members of the beam line.                                                           |
| `rows`         | `('N' \| 'V' \| 'M' \| 'w')[]`     | `['V', 'M', 'w']`                              | Diagram rows, top to bottom.                                                            |
| `loadRow`      | `boolean`                          | `true`                                         | The beam with its supports, loads and reactions above the rows.                         |
| `ranges`       | `Partial<Record<row, [min, max]>>` | each row's own range                           | Value range per row, in SI units. A fixed range keeps a row's scale while a load moves. |
| `rowHeights`   | `Partial<Record<row, number>>`     | N 100, V 116, M 128, w 76 (smaller on a phone) | Row heights, px.                                                                        |
| `maxHeight`    | `number`                           | none                                           | Rows shrink, to 60 % at most, so the figure fits this height. Text keeps its size.      |
| `units`        | `Partial<Units>`                   | kN, kNm, mm                                    | Display units.                                                                          |
| `numberFormat` | `Intl.NumberFormat`                | English, at most one decimal                   | Formats every number.                                                                   |
| `colors`       | `Partial<PlotColors>`              | none                                           | Colour overrides.                                                                       |
| `width`        | `number`                           | `720`                                          | Width in px before the box is measured, used when rendering on the server.              |
| `fontSize`     | `number`                           | `12.5`                                         | Text size, px.                                                                          |
| `hover`        | `boolean`                          | `true`                                         | The reading cursor.                                                                     |
| `loadAt`       | `number`                           | none                                           | Position in metres of a point load the reader may drag. Use it with `v-model:load-at`.  |
| `loadLabel`    | `string`                           | `P = …`                                        | Text beside the draggable load.                                                         |
| `loadStep`     | `number`                           | `0.05`                                         | The drag rounds to this step, in metres, and the arrow keys move by it.                 |
| `title`        | `string`                           | a description of the rows                      | Accessible name of the figure.                                                          |

### The reading cursor

Moving the pointer over the rows shows a cursor across all of them, with the value of each row in a pill beside its
point. Within 8 px of a step (a point load, a support) the cursor snaps to it, and V shows both values, as in
`7.2 → −12.8 kN`. The `readout` event carries `{ x, values }`, with `{ left, right }` per row in SI units.

### A draggable load

With `v-model:load-at`, the point load at that position is drawn with a grip. Dragging anywhere on the load row moves
it. The component only reports the new position: re-solve the beam with the load there and pass the new solver back.
To keep a row's scale while the load moves, set `ranges` to the envelope over every load position. The diagrams then
grow and shrink as the load moves, instead of rescaling.

## Functions

Everything the components draw comes from pure, framework-free functions, exported for custom figures and for
preparing data ahead of time:

- **`modelFromSolver(solver, { loadCase })`** reads a ts-fem solver into a `PlotModel`. The model holds geometry,
  supports, loads, reactions, and each member's `N`, `V`, `M`, `u` and `w` as piecewise polynomials along the member.
  It is plain, JSON-serialisable data, so a site can solve at build time and ship only the result.
- **Piecewise polynomials:** `valueAt(pw, x, 'left' | 'right')`, `slopeAt`, `extremes`, `innerBreaks`,
  `pieceExtrema`, `pieceDegree`, `pieceToBeziers`, `fitPiece` and `maxAbs`.
- **Readouts:** `readMember(results, x, snap)` returns the results at a point, both sides of a step included.
  `readoutAt(model, transform, px, py, reach)` finds the member under a screen point, and `formatReadout` writes a
  readout as text.
- **Beam lines:** `beamLine(model, members?)`, `lineDiagram(model, line, row)`, `rowPeaks` and `rowRange`, for
  building your own stacked figure.
- **Drawing:**
  - `buildStructureScene(model, options)` returns the drawing as items: model points with offsets in screen pixels.
  - `fitScene` fits them to a box.
  - `placeLabels` and `resolveScene` turn them into SVG path data and placed labels.
  - `supportKind` and `supportPlacement` name and orient support symbols.
  - `defaultResultLayer` picks the result a thumbnail shows.
- **Units:** `formatQuantity`, `formatNumber`, `KN_UNITS`, `SI_UNITS` and `resolveUnits`.

## Theming

Colours come from CSS custom properties on the page, so a site's light and dark themes apply as they are. Where a page
defines none, CSS system colours stand in, which follow the page's `color-scheme`.

| Used for                  | Custom property                              | Fallback     |
| ------------------------- | -------------------------------------------- | ------------ |
| Members, supports, text   | `--figure-ink`, then `--ink`                 | `CanvasText` |
| Background, label halos   | `--paper`                                    | `Canvas`     |
| Dimension lines, axes     | `--muted`                                    | `GrayText`   |
| Nodes, the draggable load | `--brand`                                    | `#4f46e5`    |
| Normal force              | `--color-normal`                             | `#2222ff`    |
| Shear force               | `--color-shear`                              | `#00af00`    |
| Bending moment            | `--color-moment`                             | `#ff2222`    |
| Deformed shape, w         | `--figure-ink`, then `--ink`                 | `CanvasText` |
| Loads                     | `--color-load`                               | `#ff8700`    |
| Reactions                 | `--color-reaction`                           | `#a020f0`    |
| Truss bars in tension     | `--color-tension`, then `--color-moment`     | `#ff2222`    |
| Truss bars in compression | `--color-compression`, then `--color-normal` | `#2222ff`    |
| Font                      | `--ebp-font`, then `--font-sans`             | `inherit`    |

The `colors` prop overrides any of these for one plot, by tone name: `ink`, `paper`, `muted`, `brand`, `normal`,
`shear`, `moment`, `deformed`, `load`, `reaction`, `tension` and `compression`.

```vue
<StructurePlot :solver="solver" :colors="{ moment: '#c00', paper: 'transparent' }" />
```

For dark mode, set the properties for the dark theme as usual:

```css
.dark {
  --ink: #eef;
  --paper: #0b0d1f;
}
```

Labels get a halo in the background colour, so they stay legible over hatching. Row names such as V(x) are set in
KaTeX's fonts when the page loads them, and fall back to a serif otherwise.

## Units and number formats

Values are SI everywhere inside, and are converted only for display. The default units are kN, kNm, kN/m, m, mm, mrad
and K. Override any of them with a symbol and a scale (display value = SI value × scale):

```vue
<StructurePlot
  :solver="solver"
  :units="{ force: { symbol: 'N', scale: 1 }, displacement: { symbol: 'm', scale: 1 } }"
/>
```

`SI_UNITS` and `KN_UNITS` are exported as starting points.

Numbers go through an `Intl.NumberFormat`. The default is English with at most one decimal. Pass your own to match
the page's language:

```vue
<StructurePlot :solver="solver" :number-format="new Intl.NumberFormat('cs', { maximumFractionDigits: 2 })" />
```

Minus signs are written as a true minus (−), and a value that rounds to zero never shows as −0.

## Server rendering, accessibility and scrolling

- **Server rendering.** Both components render on the server, for example in Nuxt with prerendering. Nothing touches
  `window` before mounting, and ids come from Vue's `useId`, so two plots on one page never share an id. The first
  render uses the `width` prop. Once mounted, the plot measures its box and lays out again at that width.
- **Accessibility.**
  - Each figure is labelled by an SVG `<title>`, set from the `title` prop or describing what is shown.
  - Layers that are reserved but hidden are `aria-hidden`.
  - The draggable load in `DiagramStack` is a focusable `role="slider"` with its value range and position. The arrow
    keys move it by `loadStep`, Page Up and Page Down by 1 m, and Home and End to the ends of the beam.
  - Under `prefers-reduced-motion`, nothing animates.
- **Scrolling and taps.**
  - A plot never captures the mouse wheel or touch gestures. A static plot (`StructurePlot` without `hover`)
    attaches no event listeners at all, so the page scrolls over it and taps reach links around it.
  - With `hover`, or with a draggable load, the component listens to pointer events only. It sets
    `touch-action: pan-y pinch-zoom`, so vertical scrolling and zooming still work over it.

## Browser support

The build targets Vite's default, `baseline-widely-available`: Chrome and Edge 107, Firefox 104, Safari 16 and later.
The plots use `ResizeObserver`, CSS custom properties in SVG, and `paint-order` for label halos. Development and the
screenshot checks run in Chromium.

## Development

```sh
npm install
npm run dev        # the playground: textbook cases, the app's examples, staged figures
npm run test:run   # Vitest: closed-form checks of the results, layout and labels
npm run typecheck  # vue-tsc, strict
npm run build      # dist/: the library bundle and its .d.ts files
```

Source: <https://github.com/EduBeamApp/plot>. Report bugs and ideas in its
[issues](https://github.com/EduBeamApp/plot/issues).

## Author

Jan Voříšek ([github.com/janvorisek](https://github.com/janvorisek)), author of EduBeam and ts-fem.

## License

[GPL-3.0](./LICENSE), © 2026 Jan Voříšek.
