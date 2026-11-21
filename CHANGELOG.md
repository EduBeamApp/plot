# Changelog

All notable changes to `@edubeam/plot` are listed here. The project follows [Semantic Versioning](https://semver.org).

## 0.3.1 (2026-11-21)

- Every diagram has an undrawn `hitArea` path covering it, whatever its fill, tagged with its member, so an app
  can treat the pointer over a diagram as over its member.
- A member's name along a vertical member reads upward, as the diagrams' values do; it read downward.
- A member's name stays at its member's middle across a diagram's line, moving only for another label.
- A power of ten in a label (`1.63·10⁻³`) is written as a real superscript, smaller and raised, in plain digits,
  in the component and in `.svg` files alike; `textRuns` splits a label so an app can do the same.
- `displacementMarker` marks the largest displacement: a dot on the deformed shape and a dashed line to it from
  where that point was. Its value may stand anywhere round the dot, and is placed after every maximum.
- `extremeOrdinates` draws the ordinate of a diagram's maximum inside a member (the largest moment under a
  distributed load). A maximum's value stays at its tip across other diagrams' lines.
- A scene item's `requires` names the label it goes with: left out for want of room, the label takes its marks
  with it, so no dot or ordinate points at a value that is not there.
- `loadNumberFormat`: the loads' values in a format of their own, so given data can drop the zeros results keep
  (10 kN, not 10.00 kN).
- A point force's value tries other places round its arrow before giving up, and given data with no free place
  takes the place that covers the fewest labels, instead of overlapping at its first.
- Among given data's labels of equal rank, the one with the fewest places is placed first.
- `keptGroups`: a label with no free place takes the place that covers the fewest labels already kept, rather
  than always its first.
- A nodal load naming a node that is not in the model is left out by `modelFromSolver` instead of throwing.

## 0.3.0 (2026-11-20)

- **Drawing for an editor**: the options the EduBeam app's new renderer draws with, all off by default.
  `sizes` overrides the symbols' px sizes; `loadLabels: 'ends'` writes a distributed load at both ends as bare
  numbers; `constantDiagrams: 'ends'` and `cornerValues: 'each'` annotate every segment and every member's end;
  `splitLoads` draws a load's two components as the two loads they were entered as; `sideBySide` stands two
  values written along one ordinate line side by side, each half a line aside, rather than one pushed out;
  `freeNodes` draws nodes no member reaches yet; `labelsAvoidSupports`, `displacementText`, `diagramFill`
  (`hatch`, `solid`, `none`), `showDegrees`, `normalOnDashedSide`, `shearOnDashedSide` and `supportScale` follow
  the app's settings.
- **Member names**: a `memberLabels` layer writes each member's name once, along it and never upside down.
- **Loads that push the same way stack**, as a textbook draws them: a second band on top of the first, a point
  load's arrow beyond the last one's value.
- **Reactions on their line of action**: every reaction force, the horizontal ones too, now points at its node.
- A diagram running straight on through a node writes the value it has on both sides once.
- **Pointing at things**: paths, circles and texts carry the `entity` they draw (`member:…`, `node:…`,
  `elementLoad:…`, `nodalLoad:…`), loads carry their `source` from `modelFromSolver`, and each distributed
  load has an undrawn `hitArea` path covering its band, so an app can highlight or hit-test what it shows.
- **Values at the pointer**: `placeReadoutTags` places a readout's tags beside their diagram points, outward
  only and inside a viewport; `readMember` and `readoutAt` snap to a member's ends and, for the quantities read,
  to their interior extremes (the largest moment, where the shear is zero, first); `formatReadout` takes a
  writer for displacements.
- **Label priorities**: `resolveScene` takes `lateGroups` (placed after the given data), `yieldingGroups` (give
  way to every other label) and `keptGroups` (never left out), and reports the painted `bounds`. A text placement
  marked `acrossDiagrams` may cross another diagram's outline.
- A structure drawn at an extreme zoom (a fit's first probe) no longer runs out of memory: a member gets at most
  500 load arrows or hatch lines, spaced wider when it is longer.
- **Faster**: labels are placed against a spatial grid (a 375-member frame placed in 0.3 s, down from 10 s),
  `mergePaths` joins alike paths (a band of thirty arrows becomes two paths), and diagram maxima are cached.
- **`sceneSvg`** writes a scene laid out by an application as a standalone `.svg` file, and **`sceneMarkup`** as
  markup for an SVG of its own, with the same Word- and Inkscape-safe output as `structureSvg`.
- `SymbolSizes` is exported.

## 0.2.0 (2026-11-19)

- **Translatable screen-reader texts**: `PLOT_TEXTS` (an injection key) lets an app give the figure's accessible
  name and the movable load's slider texts in its own language, `app.provide(PLOT_TEXTS, { structure: (layers) => … })`,
  or a ref of them to follow a language switch. English stays the default, and a `title` prop still wins.
  `temperature` sets the temperature load's symbols on the figure (`temperatureSymbols` in `structureSvg`):
  `ΔT` and `ΔTb − ΔTt` unless given, `ΔTs` and `ΔTd − ΔTh` in the Czech app.
- **Bottom fibres**: every member has the app's thin dashed line beside it, on its local +z side, so a drawing
  shows which face a positive bending moment stretches. It belongs to the `members` layer.
- **Support symbols as the EduBeam app draws them**, stroke for stroke: a pin is a bare triangle, a roller the
  triangle on its track, a clamp a wall with seven hatch strokes, a slider two hatched rails, and the
  rotation-only support the app's cross with its corner strokes. Supports still turn away from their members.
- **Reactions as an exercise's unknowns**: `reactionLabels: 'names'` (a `StructurePlot` prop and a
  `structureSvg` option) draws an arrow for every restrained direction, pointing the way it counts as positive
  (along the node's x, up, counter-clockwise), named A_x, A_z and M_A, in italic with real subscripts, instead of sized. It needs
  no results, so an unsolved model can be an exercise sheet. Names are placed before node labels.
- `reserveReactionLabels` (a prop, a `structureSvg` option and a `layoutStructure` argument) makes room for both
  reaction label styles, so an exercise that turns into its solution keeps its drawing where it is.
- Labels can carry a subscript (`sub` on scene text), drawn as a smaller, lower `tspan` with a halo of its own.
- Dimension lines mark each stop with the oblique stroke of a technical drawing.
- A fixing moment's name at a wall goes up and away from the beam and its loads, and arrow heads keep labels
  off them as their shafts do.
- **Reactions are bare numbers**, like the diagram values and as the EduBeam app writes them: a figure gives
  units with what is given (loads, settlements, temperature changes), not with results. Before, a reaction read
  "36 kN" next to a moment diagram reading "54".
- **`structureSvg(model, options)`** writes a plot as a standalone `.svg` file: plain colours (`PRINT_COLORS`,
  or your own), no CSS custom properties, label halos as separate text, so Word, Inkscape, LaTeX tool chains
  and cairosvg draw it as the page does. `layoutStructure` is the shared layout behind it and `StructurePlot`.
- **Chain dimensions**: the `dimensions` layer gives every span between nodes and point loads along x, and
  every storey along z, with the overall size on a second line, as an exercise sheet does.
- A load's or a reaction's value is placed before any diagram's numbers, so it can no longer be pushed out
  by the labels of a reserved result (a point load's "20 kN" over a step in V disappeared).
- A step in V or N over a support shows both its values (the joint rule that writes a rigid corner's moment
  once no longer swallows a shear step of equal size), and a symmetric structure's largest deflection is
  labelled in every span where it occurs.
- Labels keep off the diagram on show (a load's value moves along its band, a constant diagram's value to a
  quarter point) without the fit ever depending on which diagram that is; curved outlines are followed
  exactly. Node labels clear the arc of a fixing or nodal moment; settlement, nodal moment and reaction
  values have alternative places.
- Floating-point noise is rounded away before formatting: a reaction of 8749.999… N reads 8.75 kN.
- `structureSvg` takes `reserve` and `reserveLabelModes`, so the files of a build-up line up as overlays.
- More types are exported: `TextPlacement`, `ResolveOptions`, `Bounds`, `SceneText`, `ResolvedPath`,
  `ResolvedText`, `ResolvedCircle`.
- Every non-zero end of a diagram now carries its value, as a textbook labels it; before, a member end was
  numbered only where it was that member's extreme, so e.g. a cantilever's tip shear went unlabelled.
- The hover readout marks the value where it is drawn: a dot at the tip of each shown diagram's ordinate
  (both tips across a step) or on the deformed shape, joined to the member point. The pointer also picks up
  a member from anywhere over its diagram.
- Labels of result layers shown one at a time (reserved but hidden) no longer push out the labels of the
  layer on show.
- A nodal load whose arrow would lie along a member at its node, such as a load at a truss's bottom chord
  under a vertical, hangs off the node on the free side instead.
- With `animate` off, paths no longer carry the draw-on dash styling at all.
- `readoutMarks` and `isBarStructure` are exported.

## 0.1.0 (2026-11-18)

The first release.

- **`StructurePlot`** draws a plane frame, beam or truss solved by @edubeam/fem.
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
- **Types and plugin.** `StructurePlotProps`, `DiagramStackProps` and their emit types are exported for typed
  wrappers. `app.use(EduBeamPlot)` registers both components globally. Declarations resolve under bundler, node16 and
  nodenext module resolution.
- **Theming** through CSS custom properties, with system-colour fallbacks, so a page's light and dark themes apply.
- **Server rendering, accessibility and scrolling.** It renders on the server, has accessible names and a keyboard
  slider for the draggable load, and respects `prefers-reduced-motion`. A static plot never captures scrolling or
  taps.
