/** Geometry helpers for the technical sketch editor. Pure functions, no DOM. */

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeRect(x, y, w, h) {
  const nx = w < 0 ? x + w : x;
  const ny = h < 0 ? y + h : y;
  return { x: nx, y: ny, w: Math.abs(w), h: Math.abs(h) };
}

export function projectPointToSegment(p, seg) {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-8) return { x: seg.x1, y: seg.y1, t: 0 };
  let t = ((p.x - seg.x1) * dx + (p.y - seg.y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: seg.x1 + t * dx, y: seg.y1 + t * dy, t };
}

export function arrowSize(strokeWidth) {
  return 8 + Number(strokeWidth || 2) * 2.2;
}

export function arrowHeadPoints(tip, from, size) {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
  const spread = 0.42;
  return [
    { x: tip.x, y: tip.y },
    { x: tip.x - size * Math.cos(ang - spread), y: tip.y - size * Math.sin(ang - spread) },
    { x: tip.x - size * Math.cos(ang + spread), y: tip.y - size * Math.sin(ang + spread) },
  ];
}

/** Rotation that keeps dimension text upright (readable left-to-right). */
export function uprightAngle(x1, y1, x2, y2) {
  let rad = Math.atan2(y2 - y1, x2 - x1);
  if (rad > Math.PI / 2) rad -= Math.PI;
  if (rad < -Math.PI / 2) rad += Math.PI;
  return rad;
}

export function crossSegments(cx, cy, r) {
  const k = r * 0.62;
  return [
    { x1: cx - k, y1: cy - k, x2: cx + k, y2: cy + k },
    { x1: cx - k, y1: cy + k, x2: cx + k, y2: cy - k },
  ];
}

export function cloneShape(shape) {
  return structuredClone(shape);
}

export function translateShape(shape, dx, dy) {
  const copy = cloneShape(shape);
  switch (copy.type) {
    case "line":
    case "arrow":
    case "dimension":
      copy.x1 += dx;
      copy.y1 += dy;
      copy.x2 += dx;
      copy.y2 += dy;
      break;
    case "rect":
    case "text":
      copy.x += dx;
      copy.y += dy;
      break;
    case "circle":
    case "marker":
      copy.cx += dx;
      copy.cy += dy;
      break;
    case "triangle":
      copy.points = copy.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      break;
    default:
      break;
  }
  return copy;
}

export function shapePoints(shape) {
  switch (shape.type) {
    case "line":
    case "arrow":
    case "dimension":
      return [
        { x: shape.x1, y: shape.y1 },
        { x: shape.x2, y: shape.y2 },
      ];
    case "rect":
      return [
        { x: shape.x, y: shape.y },
        { x: shape.x + shape.w, y: shape.y },
        { x: shape.x + shape.w, y: shape.y + shape.h },
        { x: shape.x, y: shape.y + shape.h },
      ];
    case "triangle":
      return shape.points.map((p) => ({ x: p.x, y: p.y }));
    case "circle":
    case "marker":
      return [{ x: shape.cx, y: shape.cy }];
    case "text":
      return [{ x: shape.x, y: shape.y }];
    default:
      return [];
  }
}

const measuredTextBoxes = new Map();

/** World-space ink box of a text shape, taken from the rendered glyphs. */
export function setMeasuredTextBox(id, box) {
  if (!id) return;
  if (!box || !(box.w > 0) || !(box.h > 0)) measuredTextBoxes.delete(id);
  else measuredTextBoxes.set(id, { x: box.x, y: box.y, w: box.w, h: box.h });
}

export function clearMeasuredTextBoxes() {
  measuredTextBoxes.clear();
}

export function textWidth(text, fontSize) {
  const lines = String(text ?? "").split("\n");
  const max = Math.max(1, ...lines.map((line) => line.length));
  return max * fontSize * 0.62;
}

export function textHeight(text, fontSize) {
  const lines = String(text ?? "").split("\n");
  return Math.max(1, lines.length) * fontSize * 1.25;
}

export function supportsCaption(type) {
  return type === "line" || type === "arrow" || type === "rect" || type === "triangle" || type === "circle";
}

/** Centre of the caption, and rotation in degrees so a line label stays upright. */
export function captionAnchor(shape) {
  if (!shape || !supportsCaption(shape.type)) return null;
  if (shape.type === "rect") return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2, rotate: 0 };
  if (shape.type === "circle") return { x: shape.cx, y: shape.cy, rotate: 0 };
  if (shape.type === "triangle" && shape.points?.length === 3) {
    const [a, b, c] = shape.points;
    return { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, rotate: 0 };
  }
  return {
    x: (shape.x1 + shape.x2) / 2,
    y: (shape.y1 + shape.y2) / 2,
    rotate: (uprightAngle(shape.x1, shape.y1, shape.x2, shape.y2) * 180) / Math.PI,
  };
}

function includeCaption(shape, box) {
  if (!shape.caption || !String(shape.caption).trim()) return box;
  const anchor = captionAnchor(shape);
  if (!anchor) return box;
  const size = Number(shape.fontSize) || 18;
  const lines = String(shape.caption).split("\n");
  const estW = Math.max(1, ...lines.map((line) => line.length)) * size * 0.62;
  const estH = Math.max(size, lines.length * size * 1.25);
  const along = shape.type === "line" || shape.type === "arrow";
  const halfW = along ? Math.max(estW, estH) / 2 : estW / 2;
  const halfH = along ? Math.max(estW, estH) / 2 : estH / 2;
  const left = Math.min(box.x, anchor.x - halfW);
  const top = Math.min(box.y, anchor.y - halfH);
  const right = Math.max(box.x + box.w, anchor.x + halfW);
  const bottom = Math.max(box.y + box.h, anchor.y + halfH);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function shapeBounds(shape) {
  const pad = (Number(shape.strokeWidth) || 2) * 0.5 + 2;
  let box;
  switch (shape.type) {
    case "line":
    case "arrow":
    case "dimension": {
      const extra =
        (shape.type === "line" ? 0 : arrowSize(shape.strokeWidth || 2)) +
        (shape.type === "dimension" ? (shape.fontSize || 16) * 0.85 : 0);
      const x = Math.min(shape.x1, shape.x2) - pad - extra;
      const y = Math.min(shape.y1, shape.y2) - pad - extra;
      const r = Math.max(shape.x1, shape.x2) + pad + extra;
      const b = Math.max(shape.y1, shape.y2) + pad + extra;
      box = { x, y, w: r - x, h: b - y };
      break;
    }
    case "rect":
      box = { x: shape.x - pad, y: shape.y - pad, w: shape.w + pad * 2, h: shape.h + pad * 2 };
      break;
    case "triangle": {
      const xs = shape.points.map((p) => p.x);
      const ys = shape.points.map((p) => p.y);
      const x = Math.min(...xs) - pad;
      const y = Math.min(...ys) - pad;
      const r = Math.max(...xs) + pad;
      const b = Math.max(...ys) + pad;
      box = { x, y, w: r - x, h: b - y };
      break;
    }
    case "circle":
    case "marker":
      box = {
        x: shape.cx - shape.r - pad,
        y: shape.cy - shape.r - pad,
        w: (shape.r + pad) * 2,
        h: (shape.r + pad) * 2,
      };
      break;
    case "text": {
      const measured = measuredTextBoxes.get(shape.id);
      if (measured) return { ...measured };
      const w = textWidth(shape.text, shape.fontSize || 18);
      const h = textHeight(shape.text, shape.fontSize || 18);
      return { x: shape.x, y: shape.y, w, h };
    }
    default:
      return { x: 0, y: 0, w: 0, h: 0 };
  }
  return includeCaption(shape, box);
}

export function boundsOf(shapes) {
  if (!shapes || !shapes.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const shape of shapes) {
    const box = shapeBounds(shape);
    x0 = Math.min(x0, box.x);
    y0 = Math.min(y0, box.y);
    x1 = Math.max(x1, box.x + box.w);
    y1 = Math.max(y1, box.y + box.h);
  }
  if (!Number.isFinite(x0)) return null;
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

export function shapeIntersectsRect(shape, rect) {
  const box = shapeBounds(shape);
  return !(box.x > rect.x + rect.w || box.x + box.w < rect.x || box.y > rect.y + rect.h || box.y + box.h < rect.y);
}

function pointInTriangle(p, a, b, c) {
  const sign = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

export function hitTestShape(shape, p, tol) {
  const slop = tol + (Number(shape.strokeWidth) || 2) / 2;
  switch (shape.type) {
    case "line":
    case "arrow":
    case "dimension": {
      const proj = projectPointToSegment(p, shape);
      return dist(p, proj) <= slop;
    }
    case "rect": {
      const x = shape.x;
      const y = shape.y;
      const r = x + shape.w;
      const b = y + shape.h;
      if (p.x >= x && p.x <= r && p.y >= y && p.y <= b) return true;
      const edges = [
        { x1: x, y1: y, x2: r, y2: y },
        { x1: r, y1: y, x2: r, y2: b },
        { x1: r, y1: b, x2: x, y2: b },
        { x1: x, y1: b, x2: x, y2: y },
      ];
      return edges.some((edge) => dist(p, projectPointToSegment(p, edge)) <= slop);
    }
    case "triangle": {
      const [a, b, c] = shape.points;
      if (pointInTriangle(p, a, b, c)) return true;
      const edges = [
        { x1: a.x, y1: a.y, x2: b.x, y2: b.y },
        { x1: b.x, y1: b.y, x2: c.x, y2: c.y },
        { x1: c.x, y1: c.y, x2: a.x, y2: a.y },
      ];
      return edges.some((edge) => dist(p, projectPointToSegment(p, edge)) <= slop);
    }
    case "circle":
    case "marker":
      return dist(p, { x: shape.cx, y: shape.cy }) <= shape.r + tol;
    case "text": {
      const box = shapeBounds(shape);
      return p.x >= box.x - tol && p.x <= box.x + box.w + tol && p.y >= box.y - tol && p.y <= box.y + box.h + tol;
    }
    default:
      return false;
  }
}

export function handlesFor(shape) {
  switch (shape.type) {
    case "line":
    case "arrow":
    case "dimension":
      return [
        { id: "p1", x: shape.x1, y: shape.y1 },
        { id: "p2", x: shape.x2, y: shape.y2 },
      ];
    case "rect": {
      const x = shape.x;
      const y = shape.y;
      const w = shape.w;
      const h = shape.h;
      return [
        { id: "nw", x, y },
        { id: "n", x: x + w / 2, y },
        { id: "ne", x: x + w, y },
        { id: "e", x: x + w, y: y + h / 2 },
        { id: "se", x: x + w, y: y + h },
        { id: "s", x: x + w / 2, y: y + h },
        { id: "sw", x, y: y + h },
        { id: "w", x, y: y + h / 2 },
      ];
    }
    case "triangle":
      return shape.points.map((p, index) => ({ id: "v" + index, x: p.x, y: p.y }));
    case "circle":
    case "marker":
      return [{ id: "r", x: shape.cx + shape.r, y: shape.cy }];
    default:
      return [];
  }
}

export function hitHandle(shape, point, scale, coarse) {
  const tol = (coarse ? 24 : 12) / scale;
  let best = null;
  let bestD = tol;
  for (const handle of handlesFor(shape)) {
    const d = Math.hypot(handle.x - point.x, handle.y - point.y);
    if (d <= bestD) {
      bestD = d;
      best = handle;
    }
  }
  return best;
}

const EAST = new Set(["ne", "e", "se"]);
const WEST = new Set(["nw", "w", "sw"]);
const NORTH = new Set(["nw", "n", "ne"]);
const SOUTH = new Set(["sw", "s", "se"]);

export function applyHandle(original, handleId, point, { shift = false } = {}) {
  const shape = cloneShape(original);
  if (shape.type === "line" || shape.type === "arrow" || shape.type === "dimension") {
    if (handleId === "p1") {
      shape.x1 = point.x;
      shape.y1 = point.y;
    } else {
      shape.x2 = point.x;
      shape.y2 = point.y;
    }
    if (shape.type === "dimension") {
      const length = Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
      if (!shape.labelEdited) shape.label = String(Math.max(0, Math.round(length)));
    }
    return shape;
  }
  if (shape.type === "rect") {
    let left = original.x;
    let top = original.y;
    let right = original.x + original.w;
    let bottom = original.y + original.h;
    if (WEST.has(handleId)) left = point.x;
    if (EAST.has(handleId)) right = point.x;
    if (NORTH.has(handleId)) top = point.y;
    if (SOUTH.has(handleId)) bottom = point.y;
    if (shift && handleId.length === 2) {
      const aspect = (Math.abs(original.w) || 1) / (Math.abs(original.h) || 1);
      let width = Math.abs(right - left);
      let height = Math.abs(bottom - top);
      if (width / aspect > height) height = width / aspect;
      else width = height * aspect;
      if (WEST.has(handleId)) left = right - width;
      else right = left + width;
      if (NORTH.has(handleId)) top = bottom - height;
      else bottom = top + height;
    }
    const box = normalizeRect(left, top, right - left, bottom - top);
    shape.x = box.x;
    shape.y = box.y;
    shape.w = Math.max(1, box.w);
    shape.h = Math.max(1, box.h);
    return shape;
  }
  if (shape.type === "triangle") {
    const index = Number(handleId.slice(1));
    shape.points = original.points.map((p, i) => (i === index ? { x: point.x, y: point.y } : { x: p.x, y: p.y }));
    return shape;
  }
  if (shape.type === "circle" || shape.type === "marker") {
    shape.r = Math.max(4, Math.hypot(point.x - original.cx, point.y - original.cy));
    return shape;
  }
  return shape;
}

export function constrainSquare(start, point) {
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  const sx = dx === 0 ? 1 : Math.sign(dx);
  const sy = dy === 0 ? 1 : Math.sign(dy);
  return { x: start.x + sx * side, y: start.y + sy * side };
}
