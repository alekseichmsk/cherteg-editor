/** Document model: defaults, example kitchen plan, JSON load/save. */

export const STORAGE_KEY = "cherteg-editor:v1";

export const STROKE_PALETTE = ["#1a1a1a", "#c0392b", "#1e4b8a", "#14804a", "#d68910", "#6c3483", "#5d6d7e"];
export const FILL_PALETTE = ["#ffffff", "#fde8e6", "#e7eef8", "#e5f6ec", "#fff4e0", "#f3e8f8", "#eef1f4"];

export function defaultStyle() {
  return {
    stroke: "#1e4b8a",
    strokeWidth: 2,
    fill: null,
    dashed: false,
    fontSize: 18,
  };
}

export function emptyDocument() {
  return {
    version: 1,
    title: "Чертёж",
    grid: true,
    gridSize: 20,
    snap: true,
    nextId: 1,
    nextMarker: 1,
    view: { tx: 28, ty: 20, scale: 1 },
    defaults: defaultStyle(),
    shapes: [],
  };
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cssColor(value, fallback) {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
  if (/^(rgb|hsl)a?\([0-9.,%\s/]+\)$/.test(v)) return v;
  if (/^[a-zA-Z]{3,20}$/.test(v)) return v;
  return fallback;
}

function sanitizeShape(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = raw.type;
  const allowed = ["line", "arrow", "dimension", "rect", "triangle", "circle", "text", "marker"];
  if (!allowed.includes(type)) return null;
  const shape = {
    id: String(raw.id || ""),
    type,
    stroke: cssColor(raw.stroke, "#1e4b8a"),
    strokeWidth: Math.max(0.5, Math.min(24, num(raw.strokeWidth, 2))),
    dashed: Boolean(raw.dashed),
    fill: raw.fill == null || raw.fill === "none" ? null : cssColor(raw.fill, null),
    fontSize: Math.max(10, Math.min(72, num(raw.fontSize, 18))),
  };
  if (type === "line" || type === "arrow" || type === "dimension") {
    shape.x1 = num(raw.x1);
    shape.y1 = num(raw.y1);
    shape.x2 = num(raw.x2);
    shape.y2 = num(raw.y2);
    if (type === "dimension") {
      shape.label = String(raw.label ?? "0").slice(0, 80);
      shape.labelEdited = Boolean(raw.labelEdited);
    }
  } else if (type === "rect") {
    shape.x = num(raw.x);
    shape.y = num(raw.y);
    shape.w = Math.abs(num(raw.w, 10));
    shape.h = Math.abs(num(raw.h, 10));
  } else if (type === "triangle") {
    if (!Array.isArray(raw.points) || raw.points.length !== 3) return null;
    shape.points = raw.points.map((p) => ({ x: num(p?.x), y: num(p?.y) }));
  } else if (type === "circle") {
    shape.cx = num(raw.cx);
    shape.cy = num(raw.cy);
    shape.r = Math.max(1, num(raw.r, 16));
    shape.variant = raw.variant === "filled" || raw.variant === "cross" ? raw.variant : "empty";
  } else if (type === "marker") {
    shape.cx = num(raw.cx);
    shape.cy = num(raw.cy);
    shape.r = Math.max(8, num(raw.r, 16));
    shape.n = Math.max(1, Math.round(num(raw.n, 1)));
    if (!shape.fill) shape.fill = "#ffffff";
  } else if (type === "text") {
    shape.x = num(raw.x);
    shape.y = num(raw.y);
    shape.text = String(raw.text ?? "").slice(0, 500);
  }
  if (type !== "text" && type !== "dimension" && type !== "marker" && typeof raw.caption === "string") {
    const caption = raw.caption.slice(0, 300);
    if (caption.trim()) shape.caption = caption;
  }
  return shape;
}

function maxNumericId(shapes) {
  let max = 0;
  for (const shape of shapes) {
    const n = Number(String(shape.id).replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return max;
}

export function parseDocument(data) {
  const base = emptyDocument();
  if (!data || typeof data !== "object") return base;
  const shapes = Array.isArray(data.shapes) ? data.shapes.map(sanitizeShape).filter(Boolean).slice(0, 5000) : [];
  shapes.forEach((shape, index) => {
    if (!shape.id) shape.id = "s" + (index + 1);
  });
  const ids = new Set();
  for (const shape of shapes) {
    if (ids.has(shape.id)) shape.id = "s" + (maxNumericId(shapes) + 1);
    ids.add(shape.id);
  }
  const defaults = { ...defaultStyle(), ...(data.defaults || {}) };
  defaults.stroke = cssColor(defaults.stroke, "#1e4b8a");
  defaults.fill = defaults.fill == null ? null : cssColor(defaults.fill, null);
  defaults.strokeWidth = Math.max(0.5, Math.min(24, num(defaults.strokeWidth, 2)));
  defaults.fontSize = Math.max(10, Math.min(72, num(defaults.fontSize, 18)));
  defaults.dashed = Boolean(defaults.dashed);
  const view = data.view || {};
  return {
    version: 1,
    title: String(data.title || "Чертёж").slice(0, 120),
    grid: data.grid !== false,
    gridSize: Math.max(4, Math.min(200, num(data.gridSize, 20))),
    snap: data.snap !== false,
    nextId: Math.max(maxNumericId(shapes) + 1, Math.round(num(data.nextId, 1))),
    nextMarker: Math.max(
      shapes.reduce((m, s) => (s.type === "marker" ? Math.max(m, s.n + 1) : m), 1),
      Math.round(num(data.nextMarker, 1)),
    ),
    view: {
      tx: num(view.tx, 28),
      ty: num(view.ty, 20),
      scale: Math.max(0.12, Math.min(8, num(view.scale, 1))),
    },
    defaults,
    shapes,
  };
}

function shapeBase(id, style, extra) {
  return {
    id,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    dashed: false,
    fill: null,
    fontSize: style.fontSize,
    ...extra,
  };
}

/** A simplified oblique kitchen wall with sockets, dimensions and a legend. */
export function exampleDocument() {
  const wall = { stroke: "#1e4b8a", strokeWidth: 2.5, fontSize: 18 };
  const dim = { stroke: "#c0392b", strokeWidth: 1.6, fontSize: 16 };
  const ink = { stroke: "#1a1a1a", strokeWidth: 1.5, fontSize: 18 };
  const shapes = [];
  let n = 1;
  const id = () => "s" + n++;

  shapes.push(shapeBase(id(), wall, { type: "rect", x: 220, y: 90, w: 700, h: 320, fill: "#ffffff" }));
  shapes.push(shapeBase(id(), wall, { type: "rect", x: 120, y: 140, w: 80, h: 270, fill: "#ffffff" }));

  const visible = [
    [120, 140, 174, 109],
    [200, 140, 254, 109],
    [174, 109, 254, 109],
    [200, 410, 254, 379],
    [254, 109, 254, 379],
  ];
  for (const [x1, y1, x2, y2] of visible) {
    shapes.push(shapeBase(id(), wall, { type: "line", x1, y1, x2, y2 }));
  }
  const hidden = [
    [120, 410, 174, 379],
    [174, 379, 254, 379],
    [174, 109, 174, 379],
  ];
  for (const [x1, y1, x2, y2] of hidden) {
    shapes.push(shapeBase(id(), wall, { type: "line", x1, y1, x2, y2, dashed: true }));
  }

  shapes.push(shapeBase(id(), wall, { type: "line", x1: 920, y1: 90, x2: 1076, y2: 180 }));
  shapes.push(shapeBase(id(), wall, { type: "line", x1: 920, y1: 410, x2: 1076, y2: 500 }));
  shapes.push(shapeBase(id(), wall, { type: "line", x1: 1076, y1: 180, x2: 1076, y2: 500 }));

  shapes.push(
    shapeBase(id(), dim, {
      type: "dimension",
      x1: 220,
      y1: 46,
      x2: 920,
      y2: 46,
      label: "1950",
      labelEdited: true,
    }),
  );
  shapes.push(
    shapeBase(id(), dim, {
      type: "dimension",
      x1: 64,
      y1: 90,
      x2: 64,
      y2: 410,
      label: "1600",
      labelEdited: true,
    }),
  );
  shapes.push(
    shapeBase(id(), dim, {
      type: "dimension",
      x1: 220,
      y1: 448,
      x2: 520,
      y2: 448,
      label: "1300",
      labelEdited: true,
    }),
  );

  shapes.push(
    shapeBase(id(), wall, {
      type: "circle",
      cx: 430,
      cy: 270,
      r: 16,
      variant: "cross",
      fill: "#ffffff",
    }),
  );
  shapes.push(
    shapeBase(id(), wall, {
      type: "circle",
      cx: 700,
      cy: 270,
      r: 16,
      variant: "cross",
      fill: "#ffffff",
    }),
  );
  shapes.push(
    shapeBase(id(), wall, {
      type: "marker",
      cx: 430,
      cy: 210,
      r: 16,
      n: 1,
      fill: "#ffffff",
      fontSize: 15,
    }),
  );
  shapes.push(
    shapeBase(id(), wall, {
      type: "marker",
      cx: 700,
      cy: 210,
      r: 16,
      n: 2,
      fill: "#ffffff",
      fontSize: 15,
    }),
  );
  shapes.push(shapeBase(id(), ink, { type: "text", x: 120, y: 530, text: "1  Розетка 16А, холодильник" }));
  shapes.push(shapeBase(id(), ink, { type: "text", x: 120, y: 562, text: "2  Розетка 16А, рабочая зона" }));
  shapes.push(shapeBase(id(), dim, { type: "text", x: 150, y: 96, text: "30°", fontSize: 14, stroke: "#c0392b" }));

  return {
    ...emptyDocument(),
    title: "Розетки WEST GARDEN",
    nextId: n,
    nextMarker: 3,
    shapes,
  };
}
