/** SVG markup for shapes. Shared by the canvas and by file/PDF export. */

import { arrowHeadPoints, arrowSize, boundsOf, captionAnchor, crossSegments, uprightAngle } from "./geometry.js";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function n(value) {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 100) / 100);
}

function strokeAttrs(shape, fill = "none") {
  const width = shape.strokeWidth || 2;
  const dash = shape.dashed ? ` stroke-dasharray="${n(width * 3)} ${n(width * 2)}"` : "";
  return `fill="${esc(fill || "none")}" stroke="${esc(shape.stroke || "#1a1a1a")}" stroke-width="${n(width)}" stroke-linecap="butt" stroke-linejoin="miter"${dash}`;
}

function polygon(points, fill) {
  const pts = points.map((p) => `${n(p.x)},${n(p.y)}`).join(" ");
  return `<polygon points="${pts}" fill="${esc(fill)}" stroke="none"/>`;
}

function textEl(x, y, content, { size, fill, anchor = "start", baseline = "hanging", weight = "400" }) {
  const lines = String(content ?? "").split("\n");
  const tspans = lines
    .map((line, index) => `<tspan x="${n(x)}" dy="${index === 0 ? 0 : n(size * 1.25)}">${esc(line) || " "}</tspan>`)
    .join("");
  return `<text x="${n(x)}" y="${n(y)}" text-anchor="${anchor}" dominant-baseline="${baseline}" font-family="NotoSans" font-size="${n(size)}" font-weight="${weight}" font-style="normal" fill="${esc(fill)}">${tspans}</text>`;
}

function centeredLines(text, size, fill, halo) {
  const lines = String(text).split("\n");
  const lh = size * 1.25;
  const mid = (lines.length - 1) / 2;
  return lines
    .map((line, index) => {
      const y = (index - mid) * lh;
      const common = `x="0" y="${n(y)}" text-anchor="middle" dominant-baseline="central" font-family="NotoSans" font-size="${n(size)}" font-weight="400" font-style="normal"`;
      const shown = esc(line) || " ";
      if (!halo) return `<text ${common} fill="${esc(fill)}" stroke="none">${shown}</text>`;
      return `<text ${common} fill="#ffffff" stroke="#ffffff" stroke-width="${n(size * 0.22)}" stroke-linejoin="round" paint-order="stroke fill">${shown}</text><text ${common} fill="${esc(fill)}" stroke="none">${shown}</text>`;
    })
    .join("");
}

function captionMarkup(shape) {
  if (!shape.caption || !String(shape.caption).trim()) return "";
  const anchor = captionAnchor(shape);
  if (!anchor) return "";
  const size = shape.fontSize || 18;
  const rot = anchor.rotate ? ` rotate(${n(anchor.rotate)})` : "";
  return `<g class="shape-caption" transform="translate(${n(anchor.x)} ${n(anchor.y)})${rot}">${centeredLines(shape.caption, size, shape.stroke || "#1a1a1a", true)}</g>`;
}

function dimensionMarkup(shape) {
  const x1 = shape.x1;
  const y1 = shape.y1;
  const x2 = shape.x2;
  const y2 = shape.y2;
  const size = arrowSize(shape.strokeWidth || 2);
  const color = shape.stroke || "#c0392b";
  const fontSize = shape.fontSize || 16;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const deg = (uprightAngle(x1, y1, x2, y2) * 180) / Math.PI;
  const label = shape.label ?? "0";
  const headA = arrowHeadPoints({ x: x1, y: y1 }, { x: x2, y: y2 }, size);
  const headB = arrowHeadPoints({ x: x2, y: y2 }, { x: x1, y: y1 }, size);
  const halo = fontSize * 0.32;
  return `
    <line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${strokeAttrs(shape)}/>
    ${polygon(headA, color)}
    ${polygon(headB, color)}
    <g transform="translate(${n(mx)} ${n(my)}) rotate(${n(deg)})">
      <text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-family="NotoSans" font-size="${n(fontSize)}" font-weight="400" fill="#ffffff" stroke="#ffffff" stroke-width="${n(halo)}" stroke-linejoin="round" paint-order="stroke fill">${esc(label)}</text>
      <text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-family="NotoSans" font-size="${n(fontSize)}" font-weight="400" fill="${esc(color)}" stroke="none">${esc(label)}</text>
    </g>`;
}

export function shapeToSvg(shape) {
  const id = esc(shape.id || "");
  let body = "";
  switch (shape.type) {
    case "line":
      body = `<line x1="${n(shape.x1)}" y1="${n(shape.y1)}" x2="${n(shape.x2)}" y2="${n(shape.y2)}" ${strokeAttrs(shape)}/>`;
      break;
    case "arrow": {
      const size = arrowSize(shape.strokeWidth || 2);
      const head = arrowHeadPoints({ x: shape.x2, y: shape.y2 }, { x: shape.x1, y: shape.y1 }, size);
      body = `<line x1="${n(shape.x1)}" y1="${n(shape.y1)}" x2="${n(shape.x2)}" y2="${n(shape.y2)}" ${strokeAttrs(shape)}/>${polygon(head, shape.stroke || "#1a1a1a")}`;
      break;
    }
    case "dimension":
      body = dimensionMarkup(shape);
      break;
    case "rect": {
      body = `<rect x="${n(shape.x)}" y="${n(shape.y)}" width="${n(shape.w)}" height="${n(shape.h)}" ${strokeAttrs(shape, shape.fill || "none")}/>`;
      break;
    }
    case "triangle": {
      const pts = shape.points.map((p) => `${n(p.x)},${n(p.y)}`).join(" ");
      body = `<polygon points="${pts}" ${strokeAttrs(shape, shape.fill || "none")}/>`;
      break;
    }
    case "circle": {
      const fill = shape.fill || (shape.variant === "filled" ? shape.stroke || "#1a1a1a" : "none");
      body = `<circle cx="${n(shape.cx)}" cy="${n(shape.cy)}" r="${n(shape.r)}" ${strokeAttrs(shape, fill)}/>`;
      if (shape.variant === "cross") {
        for (const seg of crossSegments(shape.cx, shape.cy, shape.r)) {
          body += `<line x1="${n(seg.x1)}" y1="${n(seg.y1)}" x2="${n(seg.x2)}" y2="${n(seg.y2)}" ${strokeAttrs(shape)}/>`;
        }
      }
      break;
    }
    case "marker": {
      const fill = shape.fill || "#ffffff";
      const fontSize = Math.min(shape.fontSize || 16, shape.r * 1.15);
      body = `<circle cx="${n(shape.cx)}" cy="${n(shape.cy)}" r="${n(shape.r)}" ${strokeAttrs({ ...shape, dashed: false }, fill)}/>`;
      body += textEl(shape.cx, shape.cy, String(shape.n ?? ""), {
        size: fontSize,
        fill: shape.stroke || "#1a1a1a",
        anchor: "middle",
        baseline: "central",
      });
      break;
    }
    case "text":
      body = textEl(shape.x, shape.y, shape.text || "", {
        size: shape.fontSize || 18,
        fill: shape.stroke || "#1a1a1a",
      });
      break;
    default:
      break;
  }
  body += captionMarkup(shape);
  return `<g data-id="${id}" data-type="${esc(shape.type)}">${body}</g>`;
}

export function buildSvgDocument(shapes, { title = "", padding = 24, background = "#ffffff" } = {}) {
  const box = boundsOf(shapes) || { x: 0, y: 0, w: 400, h: 300 };
  const x = box.x - padding;
  const y = box.y - padding;
  const w = box.w + padding * 2;
  const h = box.h + padding * 2;
  const body = (shapes || []).map(shapeToSvg).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="${n(x)} ${n(y)} ${n(w)} ${n(h)}">
  <title>${esc(title)}</title>
  <rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${esc(background)}"/>
  ${body}
</svg>`;
}
