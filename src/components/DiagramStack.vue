<script setup lang="ts">
/**
 * The figure every statics textbook draws, as the EduBeam website's hero does: a loaded beam with
 * its shear force, bending moment and deflection stacked beneath it on one x axis. Set at the
 * page's own pixel size, so its text never shrinks on a phone.
 *
 * Optional: a cursor that reads every row (both values at a step), and a point load the reader
 * drags (`v-model:load-at`); the parent re-solves and passes the new solver back.
 */
import { computed, onBeforeUnmount, onMounted, ref, toRaw, useId, watch } from 'vue';
import { modelFromSolver } from '../core/fromSolver';
import type { PlotModel } from '../core/model';
import { valueAt } from '../core/polynomial';
import { resolveScene, sceneBounds, textWidth, type Tone } from '../core/scene';
import {
  beamLine,
  lineDiagram,
  lineModel,
  pointLoadAt,
  rowBreaks,
  rowOrdinates,
  rowOutline,
  rowPeaks,
  rowRange,
  type StackRow,
} from '../core/stack';
import { buildStructureScene, HATCH_SPACING_PX, type PlotLayer } from '../core/structure';
import { DEFAULT_NUMBER_FORMAT, formatNumber, formatQuantity, resolveUnits, type Units } from '../core/units';
import { PLOT_CSS, toneVars } from './theme';
import { usePlotTexts } from './texts';
import type { DiagramStackEmits, DiagramStackProps } from './types';

const props = withDefaults(defineProps<DiagramStackProps>(), {
  loadCase: 0,
  revision: 0,
  rows: () => ['V', 'M', 'w'],
  loadRow: true,
  hover: true,
  loadStep: 0.05,
});

const emit = defineEmits<DiagramStackEmits>();
const texts = usePlotTexts();

const titleId = useId();

const model = computed((): PlotModel => {
  void props.revision;
  if (props.model) return props.model;
  if (props.solver) return modelFromSolver(toRaw(props.solver), { loadCase: props.loadCase });
  return { nodes: [], members: [], loads: [] };
});

const line = computed(() => beamLine(model.value, props.members));
const units = computed((): Units => resolveUnits(props.units));
const format = computed(() => props.numberFormat ?? DEFAULT_NUMBER_FORMAT);
const fontSize = computed(() => props.fontSize ?? 12.5);

/* ── Size ─────────────────────────────────────────────────────────────────────────────────── */
const root = ref<HTMLElement | null>(null);
const measured = ref(0);
let observer: ResizeObserver | undefined;
onMounted(() => {
  if (!root.value || typeof ResizeObserver === 'undefined') return;
  observer = new ResizeObserver(([entry]) => {
    const w = Math.round(entry.contentRect.width);
    if (w > 0) measured.value = w;
  });
  observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());

const W = computed(() => Math.max(320, measured.value || props.width || 720));
const narrow = computed(() => W.value < 560);
const LEFT = computed(() => (narrow.value ? 52 : 60));
const RIGHT = 20;
const span = computed(() => W.value - LEFT.value - RIGHT);
const sx = (x: number) => LEFT.value + (x / line.value.length) * span.value;
const xOf = (px: number) => ((px - LEFT.value) / span.value) * line.value.length;

/* ── The load row: the structure drawing, on the rows' x scale ────────────────────────────── */
const movable = computed(() =>
  props.loadAt === undefined ? undefined : pointLoadAt(model.value, line.value, props.loadAt)
);

const loadScene = computed(() => {
  if (!props.loadRow) return null;
  const sub = lineModel(model.value, line.value, movable.value);
  const layers = new Set<PlotLayer>(['members', 'supports', 'loads', 'reactions']);
  const s = span.value / line.value.length;
  const items = buildStructureScene(sub, {
    layers,
    compact: narrow.value,
    units: units.value,
    numberFormat: format.value,
    scale: s,
    diagramSize: 0,
    deformedSize: 0,
    momentOnTensionSide: true,
  });
  const b = sceneBounds(items, s, fontSize.value);
  // Room over the beam for the draggable load and its grip, as the hero leaves it.
  const above = Math.max(-(b.minY - s * line.value.z), movable.value ? 92 : 0);
  const beamY = 28 + above;
  const t = { s, tx: LEFT.value - s * line.value.x0, ty: beamY - s * line.value.z };
  return {
    beamY,
    bottom: beamY + (b.maxY - s * line.value.z) + 6,
    resolved: resolveScene(items, t, { fontSize: fontSize.value, viewport: { width: W.value, height: 100000 } }),
  };
});

/* ── Rows ─────────────────────────────────────────────────────────────────────────────────── */
const ROW_TONE: Record<StackRow, Tone> = { N: 'normal', V: 'shear', M: 'moment', w: 'deformed' };
const UP_POSITIVE: Record<StackRow, boolean> = { N: true, V: true, M: false, w: false };
const unitOf = (row: StackRow) =>
  row === 'M' ? units.value.moment : row === 'w' ? units.value.displacement : units.value.force;

const rows = computed(() => {
  const defaults: Record<StackRow, number> = narrow.value
    ? { N: 88, V: 96, M: 104, w: 64 }
    : { N: 100, V: 116, M: 128, w: 76 };
  const gap = narrow.value ? 22 : 26;
  const top0 = loadScene.value ? loadScene.value.bottom + gap : 30;
  const natural = props.rows.map((r) => props.rowHeights?.[r] ?? defaults[r]);
  const total = natural.reduce((a, b) => a + b, 0);
  // Beside a headline the figure should fit the screen, so the rows give way; text does not.
  const available =
    props.maxHeight !== undefined ? props.maxHeight - top0 - gap * (props.rows.length - 1) - 14 : Infinity;
  const k = Math.min(1, Math.max(0.6, available / total));

  let top = top0;
  return props.rows.map((row, i) => {
    const height = Math.round(natural[i] * k);
    const pw = lineDiagram(model.value, line.value, row);
    const [min, max] = props.ranges?.[row] ?? rowRange(pw);
    const spanV = max - min || 1;
    const up = UP_POSITIVE[row];
    const axis = up ? top + (max / spanV) * height : top + (-min / spanV) * height;
    const scale = height / spanV;
    const sy = (v: number) => (up ? axis - v * scale : axis + v * scale);
    const tone = ROW_TONE[row];
    // Each peak's value: beyond the point, else beside it, else inside the diagram.
    const peaks = rowPeaks(pw).map((p) => {
      const y = sy(p.value);
      const below = up ? p.value < 0 : p.value > 0;
      const content = formatQuantity(p.value, unitOf(row), format.value);
      const w = textWidth(content, fontSize.value);
      const x = Math.min(Math.max(sx(p.x), LEFT.value + w / 2), W.value - RIGHT - w / 2);
      const over = y - 7;
      const under = y + fontSize.value + 3;
      const beside = y + fontSize.value * 0.35;
      return {
        text: content,
        width: w,
        places: [
          { x, y: below ? under : over },
          { x: Math.min(x + w / 2 + 10, W.value - RIGHT - w / 2), y: beside },
          { x: Math.max(x - w / 2 - 10, LEFT.value + w / 2), y: beside },
          { x, y: below ? over : under },
        ],
      };
    });
    const entry = {
      row,
      tone,
      top,
      height,
      axis,
      sy,
      pw,
      outline: rowOutline(pw, sx, sy, row !== 'w'),
      ordinates: row === 'w' ? '' : rowOrdinates(pw, sx, sy, HATCH_SPACING_PX),
      peaks,
    };
    top += height + gap;
    return entry;
  });
});

/** The rows' values, placed in turn; one whose places are all taken by earlier ones is left out. */
const peakLabels = computed(() => {
  const h = fontSize.value;
  const taken: { x0: number; x1: number; y0: number; y1: number }[] = [];
  return rows.value.map((r) =>
    r.peaks.flatMap((p) => {
      for (const place of p.places) {
        const box = { x0: place.x - p.width / 2 - 2, x1: place.x + p.width / 2 + 2, y0: place.y - h, y1: place.y + 3 };
        if (taken.some((t) => box.x0 < t.x1 && t.x0 < box.x1 && box.y0 < t.y1 && t.y0 < box.y1)) continue;
        taken.push(box);
        return [{ ...place, text: p.text, tone: r.tone }];
      }
      return [];
    })
  );
});

const height = computed(() => {
  const last = rows.value[rows.value.length - 1];
  // Room under the last row for a value written below its lowest point.
  const below = Math.max(0, ...(peakLabels.value[peakLabels.value.length - 1] ?? []).map((l) => l.y + 6));
  return Math.ceil(last ? Math.max(last.top + last.height + 14, below) : (loadScene.value?.bottom ?? 0) + 8);
});

const rowName: Record<StackRow, string> = { N: 'N', V: 'V', M: 'M', w: 'w' };

/* ── Reading values off the figure ────────────────────────────────────────────────────────── */
const cursor = ref<number | null>(null);
const SNAP_PX = 8;
const breaks = computed(() => [
  ...new Set(props.rows.flatMap((r) => rowBreaks(lineDiagram(model.value, line.value, r)))),
]);

const readout = computed(() => {
  const at = cursor.value;
  if (at === null) return null;
  const snapped = breaks.value.find((b) => Math.abs(sx(b) - sx(at)) < SNAP_PX);
  const x = snapped ?? at;
  const values = Object.fromEntries(
    rows.value.map((r) => [r.row, { left: valueAt(r.pw, x, 'left'), right: valueAt(r.pw, x, 'right') }])
  ) as Partial<Record<StackRow, { left: number; right: number }>>;
  return { x, values };
});
watch(readout, (r) => emit('readout', r));

/** One value per row, in a pill above its point on the side with more room; a step shows both sides. */
const marks = computed(() => {
  const r = readout.value;
  if (!r) return [];
  const right = r.x < line.value.length * 0.7;
  return rows.value.map((row) => {
    const v = r.values[row.row] ?? { left: 0, right: 0 };
    const unit = unitOf(row.row);
    const same = formatNumber(v.left * unit.scale, format.value) === formatNumber(v.right * unit.scale, format.value);
    const content = same
      ? formatQuantity(v.right, unit, format.value)
      : `${formatNumber(v.left * unit.scale, format.value)} → ${formatQuantity(v.right, unit, format.value)}`;
    const ys = same ? [row.sy(v.right)] : [row.sy(v.left), row.sy(v.right)];
    const width = textWidth(content, fontSize.value) * 1.12 + 16;
    const left = right ? sx(r.x) + 8 : sx(r.x) - 8 - width;
    return { key: row.row, tone: row.tone, ys, text: content, width, left, top: Math.min(...ys) - 30 };
  });
});

/* ── Moving the load ──────────────────────────────────────────────────────────────────────── */
const svg = ref<SVGSVGElement | null>(null);
const dragging = ref(false);
const clamp = (x: number) => Math.min(line.value.length, Math.max(0, Math.round(x / props.loadStep) * props.loadStep));
/** The pointer in figure px and line metres; null before the figure has a size on screen. */
const pointer = (e: PointerEvent): { x: number; y: number } | null => {
  const rect = svg.value?.getBoundingClientRect();
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
  return {
    x: xOf(((e.clientX - rect.left) / rect.width) * W.value),
    y: ((e.clientY - rect.top) / rect.height) * height.value,
  };
};

const onDown = (e: PointerEvent) => {
  const p = pointer(e);
  if (!p || props.loadAt === undefined || !loadScene.value) return;
  // The load row moves the load; anywhere below reads values off the diagrams.
  if (p.y > loadScene.value.bottom + 6) return;
  dragging.value = true;
  if (e.currentTarget instanceof Element) e.currentTarget.setPointerCapture?.(e.pointerId);
  emit('update:loadAt', clamp(p.x));
};
const onMove = (e: PointerEvent) => {
  const p = pointer(e);
  if (!p) return;
  if (dragging.value) emit('update:loadAt', clamp(p.x));
  else if (props.hover) cursor.value = p.x >= 0 && p.x <= line.value.length ? p.x : null;
};
const onUp = () => (dragging.value = false);
const onLeave = () => (cursor.value = null);

const onKey = (e: KeyboardEvent) => {
  if (props.loadAt === undefined) return;
  const s = props.loadStep;
  const step = { ArrowLeft: -s, ArrowDown: -s, ArrowRight: s, ArrowUp: s, PageDown: -1, PageUp: 1 }[e.key];
  if (step !== undefined) emit('update:loadAt', clamp(props.loadAt + step));
  else if (e.key === 'Home') emit('update:loadAt', 0);
  else if (e.key === 'End') emit('update:loadAt', line.value.length);
  else return;
  e.preventDefault();
};

const interactive = computed(() => props.hover || props.loadAt !== undefined);
const listeners = computed(() =>
  interactive.value
    ? { pointerdown: onDown, pointermove: onMove, pointerup: onUp, pointercancel: onUp, pointerleave: onLeave }
    : {}
);

const handle = computed(() => {
  if (props.loadAt === undefined || !loadScene.value) return null;
  const load = movable.value;
  const magnitude =
    load && (load.kind === 'pointForce' || load.kind === 'nodalForce') ? Math.hypot(load.fx, load.fz) : 0;
  const x = sx(props.loadAt);
  const nearEnd = props.loadAt > line.value.length - line.value.length * 0.15;
  return {
    x,
    y: loadScene.value.beamY,
    text: props.loadLabel ?? `P = ${formatQuantity(magnitude, units.value.force, format.value)}`,
    nearEnd,
  };
});

const colour = (tone: Tone | 'paper') => `var(--ebp-${tone})`;
const rootStyle = computed(() => toneVars(props.colors));
const label = computed(() => props.title ?? texts.value.stack(props.rows));
const bottom = computed(() => {
  const last = rows.value[rows.value.length - 1];
  return last ? last.top + last.height : height.value;
});
</script>

<template>
  <div ref="root" class="ebp ebp-stack" :style="rootStyle">
    <svg
      ref="svg"
      class="ebp-svg"
      :width="W"
      :height="height"
      :viewBox="`0 0 ${W} ${height}`"
      :font-size="fontSize"
      role="group"
      :aria-labelledby="titleId"
      :style="interactive ? { touchAction: 'pan-y pinch-zoom' } : undefined"
      v-on="listeners"
    >
      <title :id="titleId">{{ label }}</title>
      <component :is="'style'">{{ PLOT_CSS }}</component>

      <!-- Row names, as the diagrams are named on a blackboard -->
      <g class="ebp-math" font-size="15">
        <text
          v-for="r in rows"
          :key="r.row"
          :x="LEFT - 12"
          :y="r.axis + 5"
          text-anchor="end"
          :fill="colour(r.tone)"
          :opacity="r.row === 'w' ? 0.7 : undefined"
        >
          <!-- Separate tspans: text between them would be condensed into spaces -->
          <tspan class="ebp-var">{{ rowName[r.row] }}</tspan>
          <tspan>(</tspan>
          <tspan class="ebp-var">x</tspan>
          <tspan>)</tspan>
        </text>
      </g>

      <!-- The load row -->
      <g v-if="loadScene">
        <path
          v-for="(p, i) in loadScene.resolved.paths"
          :key="i"
          :d="p.d"
          :stroke="p.width > 0 ? colour(p.tone) : 'none'"
          :stroke-width="p.width > 0 ? p.width : undefined"
          :stroke-opacity="p.opacity"
          :stroke-dasharray="p.dash"
          :stroke-linecap="p.cap ?? 'round'"
          stroke-linejoin="round"
          :fill="p.fill === 'tone' ? colour(p.tone) : p.fill === 'paper' ? colour('paper') : 'none'"
        />
        <circle
          v-for="(c, i) in loadScene.resolved.circles"
          :key="`c${i}`"
          :cx="c.cx"
          :cy="c.cy"
          :r="c.r"
          :stroke="colour(c.tone)"
          :stroke-width="c.width"
          :fill="colour('paper')"
        />
      </g>

      <!-- A dashed guide from the movable load down through every row -->
      <line
        v-if="handle && rows.length"
        :x1="handle.x"
        :x2="handle.x"
        :y1="handle.y"
        :y2="bottom"
        :stroke="colour('brand')"
        stroke-dasharray="3 4"
        opacity="0.45"
      />

      <!-- The rows -->
      <g v-for="r in rows" :key="r.row">
        <line
          :x1="sx(0)"
          :x2="sx(line.length)"
          :y1="r.axis"
          :y2="r.axis"
          :stroke="colour('muted')"
          stroke-opacity="0.45"
          :stroke-dasharray="r.row === 'w' ? '4 4' : undefined"
        />
        <path v-if="r.ordinates" :d="r.ordinates" :stroke="colour(r.tone)" stroke-width="1" stroke-opacity="0.55" />
        <path
          :d="r.outline"
          fill="none"
          :stroke="colour(r.tone)"
          :stroke-width="r.row === 'w' ? 2.25 : 1.75"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </g>

      <!-- Labels last, over every line -->
      <g v-if="loadScene">
        <text
          v-for="(t, i) in loadScene.resolved.texts"
          :key="i"
          :x="t.x"
          :y="t.y"
          :text-anchor="t.anchor"
          :transform="t.transform"
          :fill="colour(t.tone)"
          :font-weight="t.weight"
          v-text="t.text"
        />
      </g>
      <g v-for="(labels, i) in peakLabels" :key="`l-${i}`">
        <text
          v-for="(p, j) in labels"
          :key="j"
          :x="p.x"
          :y="p.y"
          text-anchor="middle"
          :fill="colour(p.tone)"
          v-text="p.text"
        />
      </g>

      <!-- The point load the reader moves: grab it anywhere on the load row, or focus it and use the arrow keys -->
      <g
        v-if="handle"
        class="ebp-handle"
        :class="{ 'ebp-dragging': dragging }"
        tabindex="0"
        role="slider"
        :aria-label="texts.loadHandle(handle.text)"
        :aria-valuemin="0"
        :aria-valuemax="line.length"
        :aria-valuenow="loadAt"
        :aria-valuetext="texts.loadPosition(formatNumber(loadAt ?? 0))"
        @keydown="onKey"
      >
        <rect :x="handle.x - 22" :y="handle.y - 92" width="44" height="86" fill="transparent" />
        <line
          :x1="handle.x"
          :x2="handle.x"
          :y1="handle.y - 74"
          :y2="handle.y - 13"
          :stroke="colour('brand')"
          stroke-width="3"
        />
        <path
          :d="`M${handle.x - 7},${handle.y - 14}L${handle.x + 7},${handle.y - 14}L${handle.x},${handle.y - 2}Z`"
          :fill="colour('brand')"
        />
        <circle class="ebp-grip" :cx="handle.x" :cy="handle.y - 80" r="9" :fill="colour('brand')" />
        <!-- The keyboard focus: a ring in the ink colour, clear of the grip, on any background -->
        <circle
          class="ebp-focus-ring"
          :cx="handle.x"
          :cy="handle.y - 80"
          r="16"
          fill="none"
          :stroke="colour('ink')"
          stroke-width="2"
        />
        <text
          :x="handle.x + (handle.nearEnd ? -22 : 22)"
          :y="handle.y - 76"
          :text-anchor="handle.nearEnd ? 'end' : 'start'"
          :fill="colour('brand')"
          font-weight="600"
          v-text="handle.text"
        />
      </g>

      <!-- The reading cursor -->
      <g v-if="readout && !dragging && rows.length" pointer-events="none" font-weight="600">
        <line
          :x1="sx(readout.x)"
          :x2="sx(readout.x)"
          :y1="rows[0].top - 14"
          :y2="bottom"
          :stroke="colour('ink')"
          stroke-opacity="0.3"
        />
        <text :x="sx(readout.x)" :y="rows[0].top - 20" text-anchor="middle" :fill="colour('ink')">
          <tspan class="ebp-math"><tspan class="ebp-var">x</tspan></tspan>
          = {{ formatQuantity(readout.x, units.length, format) }}
        </text>
        <g v-for="m in marks" :key="m.key">
          <circle
            v-for="(y, i) in m.ys"
            :key="i"
            :cx="sx(readout.x)"
            :cy="y"
            r="4"
            :fill="colour(m.tone)"
            :stroke="colour('paper')"
            stroke-width="1.5"
          />
          <rect
            :x="m.left"
            :y="m.top"
            :width="m.width"
            height="21"
            rx="5"
            :fill="colour('paper')"
            :stroke="colour(m.tone)"
            stroke-opacity="0.5"
          />
          <text :x="m.left + 7" :y="m.top + 15" :fill="colour(m.tone)" class="ebp-pill" v-text="m.text" />
        </g>
      </g>
    </svg>
  </div>
</template>
