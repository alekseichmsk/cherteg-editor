import assert from "node:assert/strict";
import test from "node:test";
import { captionAnchor } from "../js/geometry.js";
import { snapPointer } from "../js/snap.js";
import { buildSvgDocument } from "../js/svg.js";

const base = { scale: 1, grid: false, gridSize: 20, snap: true, coarse: false, excludeIds: new Set() };

test("vertex snap beats the grid", () => {
  const shapes = [{ id: "r", type: "rect", x: 50, y: 50, w: 40, h: 40 }];
  const res = snapPointer({ x: 58, y: 56 }, { ...base, shapes, grid: true });
  assert.equal(res.kind, "vertex");
  assert.equal(res.x, 50);
  assert.equal(res.y, 50);
});

test("circle centre", () => {
  const shapes = [{ id: "c", type: "circle", cx: 80, cy: 40, r: 18, variant: "cross" }];
  const res = snapPointer({ x: 86, y: 46 }, { ...base, shapes });
  assert.equal(res.kind, "center");
  assert.equal(res.x, 80);
  assert.equal(res.y, 40);
});

test("nearest point on a segment", () => {
  const shapes = [{ id: "l", type: "line", x1: 0, y1: 0, x2: 100, y2: 0 }];
  const res = snapPointer({ x: 40, y: 6 }, { ...base, shapes });
  assert.equal(res.y, 0);
  assert.ok(Math.abs(res.x - 40) < 0.01);
  assert.ok(res.kind === "segment" || res.kind === "align");
});

test("angle snaps to 0° and 45°", () => {
  const horizontal = snapPointer({ x: 100, y: 8 }, { ...base, shapes: [], origin: { x: 0, y: 0 } });
  assert.ok(Math.abs(horizontal.y) < 0.01, `y=${horizontal.y} kind=${horizontal.kind}`);
  assert.ok(horizontal.x > 90);

  const diagonal = snapPointer({ x: 100, y: 92 }, { ...base, shapes: [], origin: { x: 0, y: 0 } });
  const ang = Math.atan2(diagonal.y, diagonal.x) * (180 / Math.PI);
  assert.ok(Math.abs(ang - 45) < 0.5, `angle ${ang} kind ${diagonal.kind}`);
});

test("a free 53° line is not pulled to 45° or 60°", () => {
  const shapes = [{ id: "r", type: "rect", x: 0, y: 0, w: 100, h: 100 }];
  const res = snapPointer({ x: 60, y: -80 }, { ...base, shapes, origin: { x: 0, y: 0 } });
  assert.ok(Math.abs(res.x - 60) < 1, `x=${res.x}`);
  assert.ok(Math.abs(res.y - -80) < 1, `y=${res.y}`);
  assert.notEqual(res.kind, "angle");
});

test("second line snaps parallel and to the same length", () => {
  const shapes = [
    { id: "r", type: "rect", x: 0, y: 0, w: 100, h: 100 },
    { id: "l", type: "line", x1: 0, y1: 0, x2: 60, y2: -80 },
  ];
  const res = snapPointer({ x: 168, y: -72 }, { ...base, shapes, origin: { x: 100, y: 0 } });
  assert.equal(res.kind, "parallel-length");
  assert.ok(Math.abs(res.x - 160) < 0.01, `x=${res.x}`);
  assert.ok(Math.abs(res.y - -80) < 0.01, `y=${res.y}`);
  assert.match(res.label, /Параллельно и та же длина/);
});

test("parallel rail keeps length when it is not close", () => {
  const shapes = [{ id: "l", type: "line", x1: 0, y1: 0, x2: 60, y2: -80 }];
  const res = snapPointer({ x: 130, y: -40 }, { ...base, shapes, origin: { x: 100, y: 0 } });
  assert.equal(res.kind, "parallel");
  assert.ok(Math.abs(res.x - 130) < 0.5, `x=${res.x}`);
  assert.ok(Math.abs(res.y - -40) < 0.5, `y=${res.y}`);
});

test("perpendicular to an existing line", () => {
  const shapes = [{ id: "l", type: "line", x1: 0, y1: 0, x2: 200, y2: 0 }];
  const res = snapPointer({ x: 8, y: 90 }, { ...base, shapes, origin: { x: 0, y: 0 } });
  assert.ok(Math.abs(res.x) < 0.5, `x=${res.x} kind=${res.kind}`);
  assert.ok(Math.abs(res.y - 90) < 1, `y=${res.y}`);
});

test("alignment guides share x", () => {
  const shapes = [{ id: "a", type: "line", x1: 50, y1: 10, x2: 50, y2: 20 }];
  const res = snapPointer({ x: 56, y: 80 }, { ...base, shapes });
  assert.equal(res.x, 50);
  assert.ok(res.kind === "align" || res.kind === "vertex" || res.kind === "segment");
});

test("grid is the fallback", () => {
  const res = snapPointer({ x: 13, y: 27 }, { ...base, shapes: [], grid: true });
  assert.equal(res.kind, "grid");
  assert.equal(res.x, 20);
  assert.equal(res.y, 20);
});

test("snap off leaves the cursor, grid still quantizes", () => {
  const free = snapPointer({ x: 13, y: 27 }, { ...base, shapes: [], snap: false, grid: false });
  assert.equal(free.kind, "free");
  assert.equal(free.x, 13);
  const grid = snapPointer({ x: 13, y: 27 }, { ...base, shapes: [], snap: false, grid: true });
  assert.equal(grid.kind, "grid");
  assert.equal(grid.x, 20);
});

test("dimension svg puts the label on the line with a halo", () => {
  const svg = buildSvgDocument([
    {
      id: "d",
      type: "dimension",
      x1: 0,
      y1: 0,
      x2: 200,
      y2: 0,
      label: "1950",
      stroke: "#c0392b",
      strokeWidth: 1.5,
      fontSize: 16,
    },
    {
      id: "c",
      type: "circle",
      cx: 40,
      cy: 40,
      r: 12,
      variant: "cross",
      stroke: "#1e4b8a",
      strokeWidth: 2,
    },
  ]);
  assert.match(svg, /fill="#ffffff"/);
  assert.equal((svg.match(/fill="/g) || []).length > 0, true);
  const filled = buildSvgDocument([
    { id: "r", type: "rect", x: 0, y: 0, w: 10, h: 10, fill: "#ffffff", stroke: "#1e4b8a", strokeWidth: 2 },
  ]);
  assert.match(filled, /fill="#ffffff"/);
  assert.doesNotMatch(filled, /fill="none"/);
  assert.match(svg, /1950/);
  const labeled = buildSvgDocument([
    {
      id: "r",
      type: "rect",
      x: 0,
      y: 0,
      w: 100,
      h: 40,
      stroke: "#1e4b8a",
      strokeWidth: 2,
      fontSize: 18,
      caption: "Холодильник",
    },
  ]);
  assert.match(labeled, /Холодильник/);
  assert.match(labeled, /text-anchor="middle"/);
  const anchor = captionAnchor({ type: "rect", x: 0, y: 0, w: 100, h: 40 });
  assert.equal(anchor.x, 50);
  assert.equal(anchor.y, 20);
  assert.match(svg, /rotate/);
  assert.match(svg, /stroke="#ffffff"/);
  assert.match(svg, /data-type="circle"/);
  const lines = svg.match(/<line /g) || [];
  assert.ok(lines.length >= 3);
});
