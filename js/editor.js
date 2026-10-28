import {
  applyHandle,
  boundsOf,
  cloneShape,
  constrainSquare,
  dist,
  handlesFor,
  hitHandle,
  hitTestShape,
  normalizeRect,
  shapeBounds,
  shapeIntersectsRect,
  shapePoints,
  translateShape,
} from "./geometry.js";
import { describeSnap, snapPointer } from "./snap.js";
import { FILL_PALETTE, STORAGE_KEY, STROKE_PALETTE, emptyDocument, exampleDocument, parseDocument } from "./model.js";
import { shapeToSvg } from "./svg.js";
import { downloadBlob, exportPdfBlob, loadFontBuffer, renderPngBlob, svgBlob } from "./export.js";

const HINTS = {
  select: "Касание выбирает, перетаскивание переносит. Рамка — несколько объектов. Два пальца — масштаб и сдвиг.",
  hand: "Один палец двигает лист. Щипок двумя пальцами меняет масштаб.",
  line: "Тяните от точки к точке. Конец липнет к вершинам, параллелям и углам 0°/45°/90°.",
  arrow: "Линия со стрелкой на конце, куда вы отпустили палец.",
  dimension: "Размер: стрелки по краям и число на линии. Число можно заменить в панели.",
  rect: "Тяните по диагонали. Shift — квадрат.",
  square: "Тяните — получится квадрат.",
  triangle: "Тяните рамку треугольника. Вершины потом двигаются по отдельности.",
  circle: "Тяните от центра к краю. Пустая окружность.",
  "circle-filled": "Тяните от центра. Круг сразу с заливкой.",
  "circle-cross": "Окружность с крестом — так на плане обозначают розетку.",
  text: "Нажмите место надписи. На телефоне удобнее править поле «Текст».",
  marker: "Кружок с номером. Следующий номер подставится сам.",
};

const TOOLS = [
  { id: "select", label: "Выбор", short: "Выбор", icon: iconSelect() },
  { id: "hand", label: "Рука", short: "Рука", icon: iconHand() },
  { id: "line", label: "Линия", short: "Линия", icon: iconLine() },
  { id: "arrow", label: "Линия со стрелкой", short: "Стрелка", icon: iconArrow() },
  { id: "dimension", label: "Размерная линия", short: "Размер", icon: iconDim() },
  { id: "rect", label: "Прямоугольник", short: "Прямоуг.", icon: iconRect() },
  { id: "square", label: "Квадрат", short: "Квадрат", icon: iconSquare() },
  { id: "triangle", label: "Треугольник", short: "Треуг.", icon: iconTri() },
  { id: "circle", label: "Окружность", short: "Круг", icon: iconCircle(false) },
  { id: "circle-filled", label: "Залитый круг", short: "Залитый", icon: iconCircle(true) },
  { id: "circle-cross", label: "Окружность с крестом", short: "Крест", icon: iconCross() },
  { id: "text", label: "Текст", short: "Текст", icon: iconText() },
  { id: "marker", label: "Номер", short: "Номер", icon: iconMarker() },
];

function iconWrap(inner, filled) {
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
function iconSelect() {
  return iconWrap(`<path d="M5 3.5 5.4 16.2 9 13.2 12.2 19.2 14.2 18.2 11 12.4 16.2 12.2Z" fill="currentColor" stroke="none"/>`, true);
}
function iconHand() {
  return iconWrap(`<path d="M8 11V6.5a1 1 0 0 1 2 0V11"/><path d="M10 10.5V5a1 1 0 0 1 2 0v6"/><path d="M12 10.2V6.2a1 1 0 0 1 2 0V12"/><path d="M14 11.2V8a1 1 0 0 1 2 0v5.2c0 3-2 5.2-5 5.2-2.6 0-4.2-1.4-5-3L5 12.2a1 1 0 0 1 1.6-1.2L8 12"/>`);
}
function iconLine() {
  return iconWrap(`<path d="M5 19 19 5"/>`);
}
function iconArrow() {
  return iconWrap(`<path d="M5 19 18 6"/><path d="M10 6h8v8"/>`);
}
function iconDim() {
  return iconWrap(`<path d="M4 12h16"/><path d="m7 9-3 3 3 3"/><path d="m17 9 3 3-3 3"/>`);
}
function iconRect() {
  return iconWrap(`<rect x="4.5" y="6.5" width="15" height="11" rx="1"/>`);
}
function iconSquare() {
  return iconWrap(`<rect x="6" y="6" width="12" height="12" rx="1"/>`);
}
function iconTri() {
  return iconWrap(`<path d="M12 5 20 19H4Z"/>`);
}
function iconCircle(filled) {
  return iconWrap(`<circle cx="12" cy="12" r="6.5" fill="${filled ? "currentColor" : "none"}"/>`);
}
function iconCross() {
  return iconWrap(`<circle cx="12" cy="12" r="6.5"/><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6"/>`);
}
function iconText() {
  return iconWrap(`<path d="M6 6h12M12 6v12"/>`);
}
function iconMarker() {
  return iconWrap(`<circle cx="12" cy="12" r="7"/><path d="M12 8.5v7" stroke="none"/><text x="12" y="15.5" text-anchor="middle" font-size="9" font-family="sans-serif" fill="currentColor" stroke="none">1</text>`);
}

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return parseDocument(JSON.parse(raw));
  } catch {
    /* ignore broken autosave */
  }
  return emptyDocument();
}

export function startEditor() {
  const state = loadInitial();
  const view = state.view;
  let tool = "select";
  let selection = new Set();
  let clipboard = [];
  const undoStack = [];
  const redoStack = [];
  let session = null;
  let preview = null;
  let snapInfo = null;
  let spaceDown = false;
  let suppressUntilAllUp = false;
  const pointers = new Map();
  let gesture = null;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  let lastTap = { id: null, t: 0 };
  let labelDirty = false;
  let labelSnapshot = null;
  let fontHist = false;

  const viewport = document.getElementById("viewport");
  const stage = document.getElementById("stage");
  const world = document.getElementById("world");
  const gridGroup = document.getElementById("grid");
  const shapesGroup = document.getElementById("shapes");
  const guidesGroup = document.getElementById("guides");
  const overlayGroup = document.getElementById("overlay");
  const toolsNav = document.getElementById("tools");
  const titleInput = document.getElementById("doc-title");
  const textEditor = document.getElementById("text-editor");
  const textInput = document.getElementById("text-editor-input");
  const statusHint = document.getElementById("status-hint");
  const statusSnap = document.getElementById("status-snap");
  const statusZoom = document.getElementById("status-zoom");
  const fileInput = document.getElementById("file-input");
  const pdfDialog = document.getElementById("pdf-dialog");

  titleInput.value = state.title;

  const toolButtons = new Map();
  for (const item of TOOLS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tool-btn";
    btn.dataset.tool = item.id;
    btn.setAttribute("aria-label", item.label);
    btn.title = item.label;
    btn.innerHTML = `${item.icon}<span>${item.short}</span>`;
    btn.addEventListener("click", () => setTool(item.id));
    toolsNav.append(btn);
    toolButtons.set(item.id, btn);
  }

  const top = document.getElementById("top-actions");
  const files = document.getElementById("file-actions");
  const buttons = {};
  function addBtn(parent, id, label, short, handler, opts = {}) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = id;
    btn.className = "icon-btn";
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.innerHTML = `<span class="btn-label">${short || label}</span>`;
    if (opts.pressed != null) btn.setAttribute("aria-pressed", String(opts.pressed));
    btn.addEventListener("click", handler);
    parent.append(btn);
    buttons[id] = btn;
    return btn;
  }

  addBtn(top, "btn-undo", "Отменить", "Отмена", () => undo());
  addBtn(top, "btn-redo", "Вернуть", "Вернуть", () => redo());
  addBtn(top, "btn-delete", "Удалить", "Удалить", () => deleteSelection());
  addBtn(top, "btn-grid", "Сетка", "Сетка", () => toggleGrid(), { pressed: state.grid });
  addBtn(top, "btn-snap", "Привязка", "Привязка", () => toggleSnap(), { pressed: state.snap });
  addBtn(top, "btn-zoom-out", "Уменьшить", "−", () => zoomBy(1 / 1.2));
  addBtn(top, "btn-zoom-in", "Увеличить", "+", () => zoomBy(1.2));
  addBtn(top, "btn-fit", "Вписать", "Вписать", () => fitView());

  addBtn(files, "btn-duplicate", "Дублировать", "Дубль", () => duplicateSelection());
  addBtn(files, "btn-copy", "Копировать", "Копия", () => copySelection());
  addBtn(files, "btn-paste", "Вставить", "Вставить", () => pasteSelection());
  addBtn(files, "btn-json", "Скачать JSON", "JSON", () => saveJsonFile());
  addBtn(files, "btn-open", "Открыть JSON", "Открыть", () => fileInput.click());
  addBtn(files, "btn-svg", "Экспорт SVG", "SVG", () => exportSvg());
  addBtn(files, "btn-png", "Экспорт PNG", "PNG", () => exportPng());
  addBtn(files, "btn-pdf", "Экспорт PDF", "PDF", () => pdfDialog.showModal());
  addBtn(files, "btn-example", "Пример", "Пример", () => loadExample());
  addBtn(files, "btn-new", "Новый чертёж", "Новый", () => newDocument());

  buildSwatches(document.getElementById("stroke-swatches"), STROKE_PALETTE, (color) => updateStyle({ stroke: color }), "stroke");
  buildSwatches(document.getElementById("fill-swatches"), FILL_PALETTE, (color) => updateStyle({ fill: color }), "fill");
  const strokePicker = document.getElementById("stroke-picker");
  const fillPicker = document.getElementById("fill-picker");
  strokePicker.addEventListener("change", () => updateStyle({ stroke: strokePicker.value }));
  fillPicker.addEventListener("change", () => updateStyle({ fill: fillPicker.value }));
  document.getElementById("fill-none").addEventListener("click", () => updateStyle({ fill: null }));

  const widthBox = document.getElementById("width-buttons");
  for (const width of [1, 2, 4, 6]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "text-btn";
    btn.dataset.width = String(width);
    btn.textContent = String(width);
    btn.setAttribute("aria-label", `Толщина ${width}`);
    btn.addEventListener("click", () => updateStyle({ strokeWidth: width }));
    widthBox.append(btn);
  }
  document.getElementById("dash-solid").addEventListener("click", () => updateStyle({ dashed: false }));
  document.getElementById("dash-dashed").addEventListener("click", () => updateStyle({ dashed: true }));

  const fontSize = document.getElementById("font-size");
  const fontSizeValue = document.getElementById("font-size-value");
  fontSize.addEventListener("input", () => {
    const size = Number(fontSize.value);
    if (!fontHist) {
      beforeChange();
      fontHist = true;
    }
    state.defaults.fontSize = size;
    for (const shape of selectedShapes()) shape.fontSize = size;
    fontSizeValue.textContent = String(size);
    renderShapes();
    renderOverlay();
    autosave();
  });
  fontSize.addEventListener("change", () => {
    fontHist = false;
  });

  document.getElementById("variant-empty").addEventListener("click", () => setCircleVariant("empty"));
  document.getElementById("variant-filled").addEventListener("click", () => setCircleVariant("filled"));
  document.getElementById("variant-cross").addEventListener("click", () => setCircleVariant("cross"));

  const labelRow = document.getElementById("label-row");
  const labelCaption = document.getElementById("label-caption");
  const labelInput = document.getElementById("prop-label");
  const editBtn = document.getElementById("prop-edit");
  labelInput.addEventListener("focus", () => {
    labelSnapshot = snapshot();
    labelDirty = false;
  });
  labelInput.addEventListener("input", () => {
    const shape = selectedShapes()[0];
    if (!shape) return;
    if (!labelDirty) {
      undoStack.push(labelSnapshot);
      if (undoStack.length > 100) undoStack.shift();
      redoStack.length = 0;
      labelDirty = true;
    }
    if (shape.type === "marker") {
      const n = Math.max(1, Math.round(Number(labelInput.value) || shape.n));
      shape.n = n;
      state.nextMarker = Math.max(state.nextMarker, n + 1);
    } else if (shape.type === "dimension") {
      shape.label = labelInput.value;
      shape.labelEdited = true;
    } else if (shape.type === "text") {
      shape.text = labelInput.value;
    }
    renderShapes();
    renderOverlay();
    autosave();
  });
  editBtn.addEventListener("click", () => {
    const shape = selectedShapes()[0];
    if (shape && (shape.type === "text" || shape.type === "dimension")) openTextEditor(shape);
  });

  titleInput.addEventListener("input", () => {
    state.title = titleInput.value;
    autosave();
  });

  document.getElementById("pdf-cancel").addEventListener("click", () => pdfDialog.close());
  document.getElementById("pdf-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const format = document.getElementById("pdf-format").value;
    const orientation = document.getElementById("pdf-orient").value;
    pdfDialog.close();
    exportPdf(format, orientation);
  });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      beforeChange();
      applyLoaded(parseDocument(data));
      renderAll();
      autosave();
      setHint("Файл открыт");
    } catch {
      alert("Не удалось открыть файл. Нужен JSON, сохранённый этим редактором.");
    }
  });

  textInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      commitTextEditor();
    } else if (event.key === "Escape") {
      event.preventDefault();
      const shape = state.shapes.find((s) => s.id === textInput.dataset.id);
      if (shape?.type === "text") textInput.value = shape.text;
      if (shape?.type === "dimension") textInput.value = shape.label;
      textEditor.hidden = true;
    }
  });
  textInput.addEventListener("blur", () => {
    setTimeout(() => {
      if (document.activeElement !== textInput) commitTextEditor();
    }, 0);
  });

  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove);
  viewport.addEventListener("pointerup", onPointerUp);
  viewport.addEventListener("pointercancel", onPointerUp);
  viewport.addEventListener("contextmenu", (event) => event.preventDefault());
  viewport.addEventListener("wheel", onWheel, { passive: false });
  viewport.addEventListener(
    "touchmove",
    (event) => {
      if (event.target.closest("textarea, input")) return;
      event.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => {
    spaceDown = false;
  });
  new ResizeObserver(() => onViewChange()).observe(viewport);

  setTool("select");
  renderAll();
  loadFontBuffer().catch(() => {});

  window.__editor = {
    getState: () => structuredClone(state),
    getView: () => ({ ...view }),
    setView(next) {
      if (next.tx != null) view.tx = next.tx;
      if (next.ty != null) view.ty = next.ty;
      if (next.scale != null) view.scale = next.scale;
      onViewChange();
    },
    getSelection: () => [...selection],
    getTool: () => tool,
  };

  function setTool(next) {
    tool = next;
    for (const [id, btn] of toolButtons) btn.classList.toggle("active", id === tool);
    viewport.dataset.tool = tool;
    if (tool !== "select" && tool !== "hand") selection = new Set();
    snapInfo = null;
    setHint(HINTS[tool] || "");
    renderOverlay();
    syncPanel();
  }

  function setHint(text) {
    statusHint.textContent = text;
  }

  function selectedShapes() {
    return state.shapes.filter((shape) => selection.has(shape.id));
  }

  function snapshot() {
    return {
      shapes: structuredClone(state.shapes),
      nextId: state.nextId,
      nextMarker: state.nextMarker,
    };
  }

  function restore(snap) {
    state.shapes = snap.shapes;
    state.nextId = snap.nextId;
    state.nextMarker = snap.nextMarker;
    selection = new Set([...selection].filter((id) => state.shapes.some((shape) => shape.id === id)));
  }

  function beforeChange() {
    undoStack.push(snapshot());
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
    renderAll();
    autosave();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
    renderAll();
    autosave();
  }

  function allocId() {
    return "s" + state.nextId++;
  }

  function autosave() {
    clearTimeout(autosave.timer);
    autosave.timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize()));
        statusZoom.dataset.saved = "1";
      } catch {
        setHint("Не удалось сохранить в браузере — скачайте JSON");
      }
    }, 200);
  }

  function serialize() {
    return {
      version: 1,
      title: state.title,
      grid: state.grid,
      gridSize: state.gridSize,
      snap: state.snap,
      nextId: state.nextId,
      nextMarker: state.nextMarker,
      view: { tx: view.tx, ty: view.ty, scale: view.scale },
      defaults: state.defaults,
      shapes: state.shapes,
    };
  }

  function applyLoaded(doc) {
    state.title = doc.title;
    state.grid = doc.grid;
    state.gridSize = doc.gridSize;
    state.snap = doc.snap;
    state.nextId = doc.nextId;
    state.nextMarker = doc.nextMarker;
    state.defaults = { ...doc.defaults };
    state.shapes = doc.shapes;
    view.tx = doc.view.tx;
    view.ty = doc.view.ty;
    view.scale = doc.view.scale;
    selection = new Set();
    titleInput.value = state.title;
    syncToggles();
  }

  function fileBase() {
    const title = (state.title || "chertezh").trim() || "chertezh";
    return title.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
  }

  function clientToWorld(clientX, clientY) {
    const pt = stage.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = world.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function worldToClient(x, y) {
    const pt = stage.createSVGPoint();
    pt.x = x;
    pt.y = y;
    const ctm = world.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    return pt.matrixTransform(ctm);
  }

  function visibleWorldBounds() {
    const rect = stage.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return { x: -200, y: -200, w: 1200, h: 800 };
    const p1 = clientToWorld(rect.left, rect.top);
    const p2 = clientToWorld(rect.right, rect.bottom);
    return { x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y };
  }

  function snapOpts(extra = {}) {
    return {
      shapes: state.shapes,
      scale: view.scale,
      grid: state.grid,
      gridSize: state.gridSize,
      snap: state.snap,
      coarse: coarsePointer,
      excludeIds: new Set(),
      ...extra,
    };
  }

  function onViewChange() {
    world.setAttribute("transform", `translate(${view.tx} ${view.ty}) scale(${view.scale})`);
    renderGrid();
    renderOverlay();
    updateStatus();
  }

  function renderAll() {
    onViewChange();
    renderShapes();
    syncPanel();
  }

  function renderShapes() {
    shapesGroup.innerHTML = state.shapes.map(shapeToSvg).join("");
  }

  function renderGrid() {
    if (!state.grid) {
      gridGroup.innerHTML = "";
      return;
    }
    const bounds = visibleWorldBounds();
    const step = state.gridSize;
    const x0 = Math.floor(bounds.x / step) * step;
    const y0 = Math.floor(bounds.y / step) * step;
    const x1 = bounds.x + bounds.w;
    const y1 = bounds.y + bounds.h;
    let minor = "";
    let major = "";
    let count = 0;
    for (let x = x0; x <= x1 + 0.1 && count < 600; x += step, count++) {
      const d = `M ${x} ${bounds.y} V ${y1} `;
      if (Math.round(x / step) % 5 === 0) major += d;
      else minor += d;
    }
    for (let y = y0; y <= y1 + 0.1 && count < 900; y += step, count++) {
      const d = `M ${bounds.x} ${y} H ${x1} `;
      if (Math.round(y / step) % 5 === 0) major += d;
      else minor += d;
    }
    const sw = 1 / view.scale;
    gridGroup.innerHTML = `<path d="${minor}" fill="none" stroke="#e4e7ec" stroke-width="${sw}"/><path d="${major}" fill="none" stroke="#cfd5de" stroke-width="${sw * 1.15}"/>`;
  }

  function renderOverlay() {
    const bounds = visibleWorldBounds();
    const parts = [];
    if (snapInfo?.guides) parts.push(guidesMarkup(snapInfo.guides, bounds, view.scale));
    if (preview) parts.push(shapeToSvg(preview));
    const selected = selectedShapes();
    for (const shape of selected) parts.push(outlineMarkup(shape, view.scale));
    if (selected.length === 1) {
      let handles = handlesFor(selected[0]);
      if (
        session?.type === "handle" &&
        session.handleAngle != null &&
        (selected[0].type === "circle" || selected[0].type === "marker")
      ) {
        const ang = session.handleAngle;
        handles = [
          {
            id: "r",
            x: selected[0].cx + Math.cos(ang) * selected[0].r,
            y: selected[0].cy + Math.sin(ang) * selected[0].r,
          },
        ];
      }
      for (const handle of handles) parts.push(handleMarkup(handle, view.scale));
    }
    if (session?.type === "marquee") {
      const box = normalizeRect(session.x, session.y, session.x2 - session.x, session.y2 - session.y);
      const sw = 1 / view.scale;
      parts.push(
        `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="rgba(37,99,235,0.08)" stroke="#2563eb" stroke-width="${sw}" stroke-dasharray="${4 / view.scale} ${3 / view.scale}"/>`,
      );
    }
    const guidesHtml = parts.filter((part) => part.startsWith("<line") || part.startsWith("<circle")).join("");
    const rest = parts.filter((part) => !(part.startsWith("<line") || part.startsWith("<circle"))).join("");
    guidesGroup.innerHTML = guidesHtml;
    overlayGroup.innerHTML = rest;
  }

  function updateStatus() {
    const snapText = snapInfo ? describeSnap(snapInfo) : "";
    statusSnap.textContent = snapText;
    statusZoom.textContent = `${Math.round(view.scale * 100)}%`;
  }

  function zoomAt(clientX, clientY, nextScale) {
    const scale = clampScale(nextScale);
    const worldPt = clientToWorld(clientX, clientY);
    const rect = stage.getBoundingClientRect();
    view.scale = scale;
    view.tx = clientX - rect.left - worldPt.x * scale;
    view.ty = clientY - rect.top - worldPt.y * scale;
    onViewChange();
  }

  function zoomBy(factor) {
    const rect = stage.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, view.scale * factor);
  }

  function fitView() {
    const box = boundsOf(state.shapes);
    const rect = stage.getBoundingClientRect();
    if (!box || rect.width < 20 || rect.height < 20) return;
    const pad = 36;
    const scale = clampScale(Math.min((rect.width - pad * 2) / box.w, (rect.height - pad * 2) / box.h));
    view.scale = scale;
    view.tx = (rect.width - box.w * scale) / 2 - box.x * scale;
    view.ty = (rect.height - box.h * scale) / 2 - box.y * scale;
    onViewChange();
  }

  function toggleGrid() {
    state.grid = !state.grid;
    syncToggles();
    renderGrid();
    autosave();
  }

  function toggleSnap() {
    state.snap = !state.snap;
    syncToggles();
    autosave();
  }

  function syncToggles() {
    buttons["btn-grid"].setAttribute("aria-pressed", String(state.grid));
    buttons["btn-snap"].setAttribute("aria-pressed", String(state.snap));
  }

  function syncPanel() {
    const selected = selectedShapes();
    const stroke = selected[0]?.stroke || state.defaults.stroke;
    const sameStroke = selected.every((shape) => shape.stroke === stroke);
    document.querySelectorAll("[data-stroke]").forEach((btn) => {
      btn.classList.toggle("active", sameStroke && btn.dataset.stroke === stroke);
    });
    if (document.activeElement !== strokePicker && /^#[0-9a-fA-F]{6}$/.test(stroke)) strokePicker.value = stroke;

    const fill = selected[0] ? selected[0].fill : state.defaults.fill;
    const sameFill = selected.every((shape) => shape.fill === fill);
    document.querySelectorAll("[data-fill]").forEach((btn) => {
      btn.classList.toggle("active", sameFill && btn.dataset.fill === fill);
    });
    document.getElementById("fill-none").classList.toggle("active", sameFill && !fill);
    if (document.activeElement !== fillPicker && fill && /^#[0-9a-fA-F]{6}$/.test(fill)) fillPicker.value = fill;

    const width = selected[0]?.strokeWidth || state.defaults.strokeWidth;
    widthBox.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.width) === width);
    });
    const dashed = selected.length ? selected.every((shape) => shape.dashed) : state.defaults.dashed;
    document.getElementById("dash-solid").classList.toggle("active", !dashed);
    document.getElementById("dash-dashed").classList.toggle("active", dashed);

    const size = selected[0]?.fontSize || state.defaults.fontSize;
    if (document.activeElement !== fontSize) {
      fontSize.value = String(size);
      fontSizeValue.textContent = String(size);
    }

    const only = selected.length === 1 ? selected[0] : null;
    const variantRow = document.getElementById("variant-row");
    variantRow.hidden = !only || only.type !== "circle";
    if (only?.type === "circle") {
      document.getElementById("variant-empty").classList.toggle("active", only.variant === "empty");
      document.getElementById("variant-filled").classList.toggle("active", only.variant === "filled");
      document.getElementById("variant-cross").classList.toggle("active", only.variant === "cross");
    }
    const showLabel = only && (only.type === "text" || only.type === "dimension" || only.type === "marker");
    labelRow.hidden = !showLabel;
    editBtn.hidden = !(only && (only.type === "text" || only.type === "dimension"));
    if (showLabel && document.activeElement !== labelInput) {
      if (only.type === "marker") {
        labelCaption.textContent = "Номер";
        labelInput.value = String(only.n);
      } else if (only.type === "dimension") {
        labelCaption.textContent = "Размер";
        labelInput.value = only.label ?? "";
      } else {
        labelCaption.textContent = "Текст";
        labelInput.value = only.text ?? "";
      }
    }
  }

  function updateStyle(patch) {
    const selected = selectedShapes();
    if (selected.length) beforeChange();
    Object.assign(state.defaults, patch);
    for (const shape of selected) {
      if ("stroke" in patch) shape.stroke = patch.stroke;
      if ("strokeWidth" in patch) shape.strokeWidth = patch.strokeWidth;
      if ("dashed" in patch) shape.dashed = patch.dashed;
      if ("fontSize" in patch) shape.fontSize = patch.fontSize;
      if ("fill" in patch && !["text", "line", "arrow", "dimension"].includes(shape.type)) shape.fill = patch.fill;
    }
    renderShapes();
    renderOverlay();
    syncPanel();
    if (selected.length) autosave();
  }

  function setCircleVariant(variant) {
    const circles = selectedShapes().filter((shape) => shape.type === "circle");
    if (circles.length) beforeChange();
    for (const shape of circles) {
      shape.variant = variant;
      if (variant === "filled" && !shape.fill) shape.fill = shape.stroke;
    }
    renderShapes();
    renderOverlay();
    syncPanel();
    if (circles.length) autosave();
  }

  function deleteSelection() {
    if (!selection.size) return;
    beforeChange();
    state.shapes = state.shapes.filter((shape) => !selection.has(shape.id));
    selection = new Set();
    renderAll();
    autosave();
  }

  function copySelection() {
    const items = selectedShapes();
    if (!items.length) return;
    clipboard = items.map(cloneShape);
    setHint("Скопировано");
  }

  function pasteSelection() {
    if (!clipboard.length) return;
    beforeChange();
    const copies = clipboard.map((shape) => {
      const copy = translateShape(shape, 24, 24);
      copy.id = allocId();
      if (copy.type === "marker") copy.n = state.nextMarker++;
      return copy;
    });
    state.shapes.push(...copies);
    selection = new Set(copies.map((shape) => shape.id));
    clipboard = copies.map(cloneShape);
    renderAll();
    autosave();
  }

  function duplicateSelection() {
    const items = selectedShapes();
    if (!items.length) return;
    clipboard = items.map(cloneShape);
    pasteSelection();
  }

  function saveJsonFile() {
    const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: "application/json" });
    downloadBlob(blob, `${fileBase()}.json`);
  }

  async function exportSvg() {
    downloadBlob(svgBlob(state.shapes, state.title), `${fileBase()}.svg`);
  }

  async function exportPng() {
    setHint("Готовим PNG…");
    try {
      const blob = await renderPngBlob(state.shapes);
      downloadBlob(blob, `${fileBase()}.png`);
      setHint("PNG сохранён");
    } catch (err) {
      console.error(err);
      alert("Не удалось создать PNG.");
    }
  }

  async function exportPdf(format, orientation) {
    setHint("Готовим PDF…");
    try {
      const blob = await exportPdfBlob(state.shapes, { title: state.title, format, orientation });
      downloadBlob(blob, `${fileBase()}.pdf`);
      setHint("PDF сохранён");
    } catch (err) {
      console.error(err);
      alert("Не удалось создать PDF.");
      setHint("Ошибка PDF");
    }
  }

  function newDocument() {
    if (state.shapes.length && !confirm("Очистить холст и начать новый чертёж?")) return;
    beforeChange();
    applyLoaded(emptyDocument());
    renderAll();
    autosave();
  }

  function loadExample() {
    if (state.shapes.length && !confirm("Заменить холст примером плана розеток?")) return;
    beforeChange();
    applyLoaded(exampleDocument());
    renderAll();
    fitView();
    autosave();
  }

  function openTextEditor(shape) {
    const point =
      shape.type === "text"
        ? worldToClient(shape.x, shape.y)
        : worldToClient((shape.x1 + shape.x2) / 2, (shape.y1 + shape.y2) / 2);
    const rect = viewport.getBoundingClientRect();
    textEditor.hidden = false;
    textEditor.style.left = `${Math.max(8, point.x - rect.left)}px`;
    textEditor.style.top = `${Math.max(8, point.y - rect.top)}px`;
    textInput.value = shape.type === "dimension" ? shape.label ?? "" : shape.text ?? "";
    textInput.dataset.id = shape.id;
    textInput.focus();
    textInput.select();
  }

  function commitTextEditor() {
    if (textEditor.hidden) return;
    const id = textInput.dataset.id;
    textEditor.hidden = true;
    const shape = state.shapes.find((item) => item.id === id);
    if (!shape) return;
    const value = textInput.value;
    if (shape.type === "text") {
      if (!value.trim()) {
        beforeChange();
        state.shapes = state.shapes.filter((item) => item.id !== id);
        selection.delete(id);
        renderAll();
        autosave();
        return;
      }
      if (value !== shape.text) {
        beforeChange();
        shape.text = value;
        autosave();
      }
    } else if (shape.type === "dimension" && value !== shape.label) {
      beforeChange();
      shape.label = value || "0";
      shape.labelEdited = true;
      autosave();
    }
    renderAll();
  }

  function hitTop(worldPoint, coarse) {
    const tol = (coarse ? 16 : 8) / view.scale;
    for (let i = state.shapes.length - 1; i >= 0; i--) {
      if (hitTestShape(state.shapes[i], worldPoint, tol)) return state.shapes[i];
    }
    return null;
  }

  function nearestAnchor(shapes, point) {
    let best = null;
    let bestD = Infinity;
    for (const shape of shapes) {
      for (const vertex of shapePoints(shape)) {
        const d = dist(vertex, point);
        if (d < bestD) {
          bestD = d;
          best = vertex;
        }
      }
    }
    return best || { x: point.x, y: point.y };
  }

  function onPointerDown(event) {
    if (event.target.closest("textarea, input, button, a, label")) return;
    if (!textEditor.hidden) {
      commitTextEditor();
      return;
    }
    try {
      viewport.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic events in tests may not capture */
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      suppressUntilAllUp = true;
      cancelSession();
      const pts = [...pointers.values()];
      gesture = {
        dist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1,
        midX: (pts[0].x + pts[1].x) / 2,
        midY: (pts[0].y + pts[1].y) / 2,
        scale: view.scale,
        tx: view.tx,
        ty: view.ty,
      };
      snapInfo = null;
      preview = null;
      renderOverlay();
      return;
    }
    if (pointers.size > 2 || suppressUntilAllUp) return;
    if (event.pointerType === "mouse" && event.button === 2) return;
    const worldPoint = clientToWorld(event.clientX, event.clientY);
    const pan = tool === "hand" || spaceDown || (event.pointerType === "mouse" && event.button === 1);
    if (pan) {
      session = { type: "pan", sx: event.clientX, sy: event.clientY, tx: view.tx, ty: view.ty };
      viewport.dataset.panning = "1";
      return;
    }
    if (tool === "select") beginSelect(event, worldPoint);
    else beginDraw(event, worldPoint);
  }

  function beginDraw(event, worldPoint) {
    const snapped = snapPointer(worldPoint, snapOpts());
    const start = { x: snapped.x, y: snapped.y };
    session = {
      type: "draw",
      tool,
      start,
      current: start,
      shift: event.shiftKey,
      sx: event.clientX,
      sy: event.clientY,
    };
    snapInfo = snapped;
    if (tool === "text" || tool === "marker") preview = makePlaced(tool, start);
    else preview = draftShape(tool, start, start, event.shiftKey);
    renderOverlay();
    updateStatus();
  }

  function beginSelect(event, worldPoint) {
    const coarse = event.pointerType === "touch" || coarsePointer;
    const only = selection.size === 1 ? state.shapes.find((shape) => selection.has(shape.id)) : null;
    if (only) {
      const handle = hitHandle(only, worldPoint, view.scale, coarse);
      if (handle) {
        session = {
          type: "handle",
          id: only.id,
          handle: handle.id,
          original: cloneShape(only),
          snapshot: snapshot(),
          handleAngle: 0,
          moved: false,
          sx: event.clientX,
          sy: event.clientY,
        };
        return;
      }
    }
    const hit = hitTop(worldPoint, coarse);
    const now = performance.now();
    if (hit && (hit.type === "text" || hit.type === "dimension") && lastTap.id === hit.id && now - lastTap.t < 450) {
      selection = new Set([hit.id]);
      lastTap = { id: null, t: 0 };
      renderAll();
      openTextEditor(hit);
      return;
    }
    lastTap = { id: hit?.id ?? null, t: now };
    if (hit) {
      if (event.shiftKey) {
        if (selection.has(hit.id)) selection.delete(hit.id);
        else selection.add(hit.id);
      } else if (!selection.has(hit.id)) {
        selection = new Set([hit.id]);
      }
      if (!selection.has(hit.id)) {
        renderAll();
        return;
      }
      const selected = selectedShapes();
      session = {
        type: "move",
        ids: new Set(selected.map((shape) => shape.id)),
        originals: selected.map(cloneShape),
        anchor: nearestAnchor(selected, worldPoint),
        startWorld: worldPoint,
        snapshot: snapshot(),
        moved: false,
        sx: event.clientX,
        sy: event.clientY,
      };
      renderAll();
      return;
    }
    if (!event.shiftKey) selection = new Set();
    session = { type: "marquee", x: worldPoint.x, y: worldPoint.y, x2: worldPoint.x, y2: worldPoint.y, shift: event.shiftKey };
    renderAll();
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) {
      if (event.pointerType === "mouse" && pointers.size === 0 && !session) hoverSnap(event);
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture && pointers.size >= 2) {
      applyPinch();
      return;
    }
    if (suppressUntilAllUp || !session) return;
    dragSession(event);
  }

  function dragSession(event) {
    if (!session) return;
    if (session.type === "pan") {
      view.tx = session.tx + (event.clientX - session.sx);
      view.ty = session.ty + (event.clientY - session.sy);
      onViewChange();
      return;
    }
    const worldPoint = clientToWorld(event.clientX, event.clientY);
    if (session.type === "marquee") {
      session.x2 = worldPoint.x;
      session.y2 = worldPoint.y;
      renderOverlay();
      return;
    }
    const moved =
      session.sx == null || Math.hypot(event.clientX - session.sx, event.clientY - session.sy) >= 3;
    if ((session.type === "move" || session.type === "handle") && !session.moved && !moved) return;
    if (session.type === "move" || session.type === "handle") session.moved = true;

    if (session.type === "draw") {
      session.shift = event.shiftKey;
      if (session.tool === "text" || session.tool === "marker") {
        const snapped = snapPointer(worldPoint, snapOpts());
        session.current = { x: snapped.x, y: snapped.y };
        preview = makePlaced(session.tool, session.current);
        snapInfo = snapped;
      } else if (session.tool === "line" || session.tool === "arrow" || session.tool === "dimension") {
        const snapped = snapPointer(worldPoint, snapOpts({ origin: session.start, shift: session.shift }));
        session.current = { x: snapped.x, y: snapped.y };
        preview = draftShape(session.tool, session.start, session.current, session.shift);
        snapInfo = snapped;
      } else {
        let snapped = snapPointer(worldPoint, snapOpts());
        if (session.tool === "square" || (session.tool === "rect" && session.shift)) {
          const square = constrainSquare(session.start, snapped);
          snapped = { ...snapped, x: square.x, y: square.y };
        }
        session.current = { x: snapped.x, y: snapped.y };
        preview = draftShape(session.tool, session.start, session.current, session.shift);
        snapInfo = snapped;
      }
      renderOverlay();
      updateStatus();
      return;
    }

    if (session.type === "move") {
      const proposed = {
        x: session.anchor.x + (worldPoint.x - session.startWorld.x),
        y: session.anchor.y + (worldPoint.y - session.startWorld.y),
      };
      const snapped = snapPointer(proposed, snapOpts({ excludeIds: session.ids }));
      const dx = snapped.x - session.anchor.x;
      const dy = snapped.y - session.anchor.y;
      for (const original of session.originals) {
        const index = state.shapes.findIndex((shape) => shape.id === original.id);
        if (index >= 0) state.shapes[index] = translateShape(original, dx, dy);
      }
      snapInfo = snapped;
      renderShapes();
      renderOverlay();
      updateStatus();
      return;
    }

    if (session.type === "handle") {
      const original = session.original;
      let snapped;
      if (
        (original.type === "line" || original.type === "arrow" || original.type === "dimension") &&
        (session.handle === "p1" || session.handle === "p2")
      ) {
        const fixed = session.handle === "p1" ? { x: original.x2, y: original.y2 } : { x: original.x1, y: original.y1 };
        snapped = snapPointer(worldPoint, snapOpts({ origin: fixed, excludeIds: new Set([original.id]), shift: event.shiftKey }));
      } else {
        snapped = snapPointer(worldPoint, snapOpts({ excludeIds: new Set([original.id]) }));
      }
      if (original.type === "circle" || original.type === "marker") {
        session.handleAngle = Math.atan2(snapped.y - original.cy, snapped.x - original.cx);
      }
      const next = applyHandle(original, session.handle, snapped, { shift: event.shiftKey });
      const index = state.shapes.findIndex((shape) => shape.id === original.id);
      if (index >= 0) state.shapes[index] = next;
      snapInfo = snapped;
      renderShapes();
      renderOverlay();
      updateStatus();
    }
  }

  function applyPinch() {
    const pts = [...pointers.values()];
    if (pts.length < 2 || !gesture) return;
    const distNow = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
    const midX = (pts[0].x + pts[1].x) / 2;
    const midY = (pts[0].y + pts[1].y) / 2;
    const rect = stage.getBoundingClientRect();
    const scale = clampScale(gesture.scale * (distNow / gesture.dist));
    const worldX = (gesture.midX - rect.left - gesture.tx) / gesture.scale;
    const worldY = (gesture.midY - rect.top - gesture.ty) / gesture.scale;
    view.scale = scale;
    view.tx = midX - rect.left - worldX * scale;
    view.ty = midY - rect.top - worldY * scale;
    onViewChange();
  }

  function onPointerUp(event) {
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const had = pointers.delete(event.pointerId);
    try {
      viewport.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    if (!had) return;
    if (pointers.size > 0) {
      if (pointers.size < 2) gesture = null;
      return;
    }
    const skip = suppressUntilAllUp;
    suppressUntilAllUp = false;
    gesture = null;
    viewport.dataset.panning = "";
    if (skip) {
      cancelSession();
      snapInfo = null;
      preview = null;
      renderAll();
      return;
    }
    if (session && session.type !== "pan") dragSession(event);
    commitSession();
  }

  function cancelSession() {
    if (session?.snapshot && (session.type === "move" || session.type === "handle")) restore(session.snapshot);
    session = null;
    preview = null;
  }

  function commitSession() {
    const current = session;
    session = null;
    snapInfo = null;
    if (!current) {
      preview = null;
      renderOverlay();
      return;
    }
    if (current.type === "draw") {
      const shape = preview;
      preview = null;
      if (!shape) {
        renderOverlay();
        return;
      }
      const placed = current.tool === "text" || current.tool === "marker";
      if (!placed && !isBigEnough(shape)) {
        renderOverlay();
        return;
      }
      beforeChange();
      shape.id = allocId();
      if (shape.type === "marker") shape.n = state.nextMarker++;
      state.shapes.push(shape);
      selection = new Set([shape.id]);
      renderAll();
      autosave();
      if (shape.type === "text") openTextEditor(shape);
      return;
    }
    if (current.type === "move" || current.type === "handle") {
      preview = null;
      if (current.moved) {
        const changed = JSON.stringify(state.shapes) !== JSON.stringify(current.snapshot.shapes);
        if (changed) {
          undoStack.push(current.snapshot);
          if (undoStack.length > 100) undoStack.shift();
          redoStack.length = 0;
          autosave();
        }
      } else if (current.snapshot) {
        restore(current.snapshot);
      }
      renderAll();
      return;
    }
    if (current.type === "marquee") {
      const box = normalizeRect(current.x, current.y, current.x2 - current.x, current.y2 - current.y);
      const hits = state.shapes.filter((shape) => shapeIntersectsRect(shape, box)).map((shape) => shape.id);
      if (box.w < 3 && box.h < 3) {
        if (!current.shift) selection = new Set();
      } else if (current.shift) {
        hits.forEach((id) => selection.add(id));
      } else {
        selection = new Set(hits);
      }
      renderAll();
      return;
    }
    preview = null;
    renderOverlay();
  }

  function isBigEnough(shape) {
    const min = 4 / view.scale;
    if (shape.type === "line" || shape.type === "arrow" || shape.type === "dimension") {
      return Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) >= min;
    }
    if (shape.type === "rect") return shape.w >= min && shape.h >= min;
    if (shape.type === "triangle") {
      const box = shapeBounds(shape);
      return box.w >= min && box.h >= min;
    }
    if (shape.type === "circle") return shape.r >= min;
    return true;
  }

  function hoverSnap(event) {
    if (tool === "select" || tool === "hand") {
      if (snapInfo) {
        snapInfo = null;
        renderOverlay();
        updateStatus();
      }
      return;
    }
    const worldPoint = clientToWorld(event.clientX, event.clientY);
    snapInfo = snapPointer(worldPoint, snapOpts());
    renderOverlay();
    updateStatus();
  }

  function onWheel(event) {
    if (event.target.closest("textarea, input")) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * 0.0016);
      zoomAt(event.clientX, event.clientY, view.scale * factor);
    } else {
      view.tx -= event.deltaX;
      view.ty -= event.deltaY;
      onViewChange();
    }
  }

  function typingTarget(event) {
    const el = event.target;
    return el && (el.closest("input, textarea") || el.isContentEditable);
  }

  function onKeyDown(event) {
    if (event.code === "Space" && !typingTarget(event)) {
      spaceDown = true;
      event.preventDefault();
    }
    if (typingTarget(event)) return;
    const meta = event.ctrlKey || event.metaKey;
    if (meta && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (meta && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (meta && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selection = new Set(state.shapes.map((shape) => shape.id));
      renderAll();
      return;
    }
    if (meta && event.key.toLowerCase() === "c") {
      event.preventDefault();
      copySelection();
      return;
    }
    if (meta && event.key.toLowerCase() === "v") {
      event.preventDefault();
      pasteSelection();
      return;
    }
    if (meta && event.key.toLowerCase() === "d") {
      event.preventDefault();
      duplicateSelection();
      return;
    }
    if (meta && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveJsonFile();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteSelection();
      return;
    }
    if (event.key === "Escape") {
      if (session) {
        cancelSession();
        snapInfo = null;
        preview = null;
        renderAll();
      } else {
        selection = new Set();
        renderAll();
      }
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && selection.size) {
      event.preventDefault();
      const step = event.shiftKey ? state.gridSize : 1;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      beforeChange();
      state.shapes = state.shapes.map((shape) => (selection.has(shape.id) ? translateShape(shape, dx, dy) : shape));
      renderAll();
      autosave();
      return;
    }
    if (meta || event.altKey) return;
    const map = {
      v: "select",
      h: "hand",
      l: "line",
      r: "rect",
      t: "text",
      c: "circle",
      m: "marker",
    };
    const next = map[event.key.toLowerCase()];
    if (next) setTool(next);
  }

  function onKeyUp(event) {
    if (event.code === "Space") spaceDown = false;
  }

  function styleOf() {
    return {
      stroke: state.defaults.stroke,
      strokeWidth: state.defaults.strokeWidth,
      fill: state.defaults.fill,
      dashed: state.defaults.dashed,
      fontSize: state.defaults.fontSize,
    };
  }

  function draftShape(drawTool, a, b, shift) {
    const style = styleOf();
    if (drawTool === "line" || drawTool === "arrow" || drawTool === "dimension") {
      const shape = { ...style, id: "preview", type: drawTool, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      if (drawTool === "dimension") {
        shape.label = String(Math.max(0, Math.round(Math.hypot(b.x - a.x, b.y - a.y))));
        shape.labelEdited = false;
      }
      return shape;
    }
    if (drawTool === "rect" || drawTool === "square") {
      const box = normalizeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      return { ...style, id: "preview", type: "rect", ...box };
    }
    if (drawTool === "triangle") {
      const box = normalizeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      return {
        ...style,
        id: "preview",
        type: "triangle",
        points: [
          { x: box.x + box.w / 2, y: box.y },
          { x: box.x + box.w, y: box.y + box.h },
          { x: box.x, y: box.y + box.h },
        ],
      };
    }
    if (drawTool === "circle" || drawTool === "circle-filled" || drawTool === "circle-cross") {
      const variant = drawTool === "circle-filled" ? "filled" : drawTool === "circle-cross" ? "cross" : "empty";
      const fill = variant === "filled" ? style.fill || style.stroke : style.fill;
      return {
        ...style,
        id: "preview",
        type: "circle",
        cx: a.x,
        cy: a.y,
        r: Math.hypot(b.x - a.x, b.y - a.y),
        variant,
        fill,
      };
    }
    void shift;
    return null;
  }

  function makePlaced(drawTool, point) {
    const style = styleOf();
    if (drawTool === "marker") {
      return {
        ...style,
        id: "preview",
        type: "marker",
        cx: point.x,
        cy: point.y,
        r: 16,
        n: state.nextMarker,
        fill: "#ffffff",
        dashed: false,
        fontSize: Math.max(14, style.fontSize),
      };
    }
    return {
      ...style,
      id: "preview",
      type: "text",
      x: point.x,
      y: point.y,
      text: "Текст",
      fill: null,
    };
  }
}

function clampScale(value) {
  return Math.max(0.12, Math.min(8, value));
}

function buildSwatches(container, colors, onPick, kind) {
  for (const color of colors) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch";
    btn.style.background = color;
    btn.dataset[kind] = color;
    btn.setAttribute("aria-label", kind === "stroke" ? `Цвет линии ${color}` : `Заливка ${color}`);
    btn.addEventListener("click", () => onPick(color));
    container.append(btn);
  }
}

function guidesMarkup(guides, bounds, scale) {
  const sw = 1 / scale;
  const dash = `${4 / scale} ${3 / scale}`;
  return guides
    .map((guide) => {
      if (guide.type === "v") {
        return `<line x1="${guide.x}" y1="${bounds.y}" x2="${guide.x}" y2="${bounds.y + bounds.h}" stroke="#e11d74" stroke-width="${sw}" stroke-dasharray="${dash}"/>`;
      }
      if (guide.type === "h") {
        return `<line x1="${bounds.x}" y1="${guide.y}" x2="${bounds.x + bounds.w}" y2="${guide.y}" stroke="#e11d74" stroke-width="${sw}" stroke-dasharray="${dash}"/>`;
      }
      if (guide.type === "seg" || guide.type === "ray") {
        return `<line x1="${guide.x1}" y1="${guide.y1}" x2="${guide.x2}" y2="${guide.y2}" stroke="#e11d74" stroke-width="${sw * 1.4}" stroke-dasharray="${dash}"/>`;
      }
      if (guide.type === "point") {
        const r = 5 / scale;
        return `<circle cx="${guide.x}" cy="${guide.y}" r="${r}" fill="none" stroke="#e11d74" stroke-width="${1.6 / scale}"/>`;
      }
      return "";
    })
    .join("");
}

function outlineMarkup(shape, scale) {
  if (shape.type === "text") {
    const box = shapeBounds(shape);
    return `<rect data-overlay="1" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="none" stroke="#2563eb" stroke-width="${1 / scale}"/>`;
  }
  const ghost = cloneShape(shape);
  ghost.id = `${shape.id}-sel`;
  ghost.stroke = "#2563eb";
  ghost.strokeWidth = (shape.strokeWidth || 2) + 1.15 / scale;
  ghost.fill = "none";
  ghost.dashed = false;
  if (ghost.type === "dimension" || ghost.type === "arrow") ghost.type = "line";
  if (ghost.type === "marker") {
    ghost.type = "circle";
    ghost.variant = "empty";
  }
  return shapeToSvg(ghost);
}

function handleMarkup(handle, scale) {
  const s = 1 / scale;
  return `<g data-overlay="1" transform="translate(${handle.x} ${handle.y}) scale(${s})"><rect x="-7" y="-7" width="14" height="14" rx="2" fill="#ffffff" stroke="#2563eb" stroke-width="1.75"/></g>`;
}
