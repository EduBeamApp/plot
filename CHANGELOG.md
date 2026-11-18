# Changelog

All notable changes to `@edubeam/plot` are listed here. The project follows [Semantic Versioning](https://semver.org).

## 0.1.0 (unreleased)

The first release.

- **`StructurePlot`** draws a plane frame, beam or truss solved by ts-fem.
  - It draws members, hinges, supports for every DOF combination (rotated supports included), loads, reactions, the
    N, V and M diagrams, and the deformed shape.
  - It fits itself to the width of its box at real pixel size, and makes room for every label it keeps.
  - Independent layers (`nodes`, `nodeLabels`, `dimensions`, `members`, `supports`, `loads`, `reactions`, `N`, `V`,
    `M`, `w`), with `reserve`, let a figure build up in stages without moving.
  - A compact mode is for thumbnails.
  - Values sit at the tips of their ordinates, upright or along the ordinate (`resultLabelMode`), with collision
    handling.
  - Truss bar forces show along their bars, by sign.
  - Optional hover readout.
- **`DiagramStack`** draws the stacked textbook figure: a beam with its loads above its V(x), M(x) and w(x) on one x
  axis.
  - A reading cursor snaps to steps and shows both values.
  - `v-model:load-at` adds a point load the reader can drag, with the pointer or the keyboard.
  - Rows keep a fixed scale with `ranges`, and shrink to fit `maxHeight`.
- **Exact results.** `modelFromSolver` stores each member's results as piecewise polynomials, split at point loads,
  in a plain, JSON-serialisable `PlotModel`. Extremes are found exactly, and curves are drawn as exact Béziers.
- **Theming** through CSS custom properties, with system-colour fallbacks, so a page's light and dark themes apply.
- **Server rendering, accessibility and scrolling.** It renders on the server, has accessible names and a keyboard
  slider for the draggable load, and respects `prefers-reduced-motion`. A static plot never captures scrolling or
  taps.
