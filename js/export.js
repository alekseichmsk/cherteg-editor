/** PNG, SVG and PDF export. PDF is vector via jsPDF + svg2pdf, with a raster fallback. */

import { arrowHeadPoints, arrowSize, boundsOf, crossSegments, uprightAngle } from "./geometry.js";
import { buildSvgDocument } from "./svg.js";

const fontUrl = new URL("../vendor/NotoSans-Regular.ttf", import.meta.url);
let fontBufferPromise = null;

export function loadFontBuffer() {
  if (!fontBufferPromise) {
    fontBufferPromise = fetch(fontUrl).then((res) => {
      if (!res.ok) throw new Error("font " + res.status);
      return res.arrayBuffer();
    });
  }
  return fontBufferPromise;
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

export function svgBlob(shapes, title) {
  const text = buildSvgDocument(shapes, { title });
  return new Blob([text], { type: "image/svg+xml;charset=utf-8" });
}

function traceArrow(ctx, tip, from, size) {
  const [a, b, c] = arrowHeadPoints(tip, from, size);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.closePath();
}

function applyStroke(ctx, shape) {
  ctx.lineWidth = shape.strokeWidth || 2;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.strokeStyle = shape.stroke || "#1a1a1a";
  ctx.setLineDash(shape.dashed ? [ctx.lineWidth * 3, ctx.lineWidth * 2] : []);
}

function drawShape(ctx, shape) {
  switch (shape.type) {
    case "line":
      applyStroke(ctx, shape);
      ctx.beginPath();
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
      ctx.stroke();
      break;
    case "arrow": {
      applyStroke(ctx, shape);
      ctx.beginPath();
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      traceArrow(ctx, { x: shape.x2, y: shape.y2 }, { x: shape.x1, y: shape.y1 }, arrowSize(shape.strokeWidth));
      ctx.fillStyle = shape.stroke || "#1a1a1a";
      ctx.fill();
      break;
    }
    case "dimension": {
      applyStroke(ctx, shape);
      ctx.beginPath();
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      const size = arrowSize(shape.strokeWidth);
      traceArrow(ctx, { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }, size);
      ctx.fillStyle = shape.stroke || "#c0392b";
      ctx.fill();
      traceArrow(ctx, { x: shape.x2, y: shape.y2 }, { x: shape.x1, y: shape.y1 }, size);
      ctx.fill();
      const fontSize = shape.fontSize || 16;
      const mx = (shape.x1 + shape.x2) / 2;
      const my = (shape.y1 + shape.y2) / 2;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(uprightAngle(shape.x1, shape.y1, shape.x2, shape.y2));
      ctx.font = `${fontSize}px NotoSans`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = fontSize * 0.32;
      ctx.strokeStyle = "#ffffff";
      ctx.fillStyle = "#ffffff";
      ctx.lineJoin = "round";
      ctx.strokeText(shape.label ?? "", 0, 0);
      ctx.fillStyle = shape.stroke || "#c0392b";
      ctx.fillText(shape.label ?? "", 0, 0);
      ctx.restore();
      break;
    }
    case "rect":
      applyStroke(ctx, shape);
      if (shape.fill) {
        ctx.fillStyle = shape.fill;
        ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
      }
      ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
      break;
    case "triangle": {
      applyStroke(ctx, shape);
      ctx.beginPath();
      shape.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      if (shape.fill) {
        ctx.fillStyle = shape.fill;
        ctx.fill();
      }
      ctx.stroke();
      break;
    }
    case "circle": {
      applyStroke(ctx, shape);
      ctx.beginPath();
      ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2);
      const fill = shape.fill || (shape.variant === "filled" ? shape.stroke : null);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.stroke();
      if (shape.variant === "cross") {
        applyStroke(ctx, shape);
        for (const seg of crossSegments(shape.cx, shape.cy, shape.r)) {
          ctx.beginPath();
          ctx.moveTo(seg.x1, seg.y1);
          ctx.lineTo(seg.x2, seg.y2);
          ctx.stroke();
        }
      }
      break;
    }
    case "marker": {
      applyStroke(ctx, { ...shape, dashed: false });
      ctx.beginPath();
      ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2);
      ctx.fillStyle = shape.fill || "#ffffff";
      ctx.fill();
      ctx.stroke();
      const fontSize = Math.min(shape.fontSize || 16, shape.r * 1.15);
      ctx.font = `${fontSize}px NotoSans`;
      ctx.fillStyle = shape.stroke || "#1a1a1a";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(shape.n ?? ""), shape.cx, shape.cy);
      break;
    }
    case "text": {
      const fontSize = shape.fontSize || 18;
      ctx.font = `${fontSize}px NotoSans`;
      ctx.fillStyle = shape.stroke || "#1a1a1a";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      String(shape.text ?? "")
        .split("\n")
        .forEach((line, index) => {
          ctx.fillText(line, shape.x, shape.y + index * fontSize * 1.25);
        });
      break;
    }
    default:
      break;
  }
}

export async function renderPngBlob(shapes, { pixelRatio = 2, background = "#ffffff", padding = 28 } = {}) {
  if (document.fonts?.load) {
    try {
      await document.fonts.load("16px NotoSans");
    } catch {
      /* system fallback still draws latin digits */
    }
  }
  const box = boundsOf(shapes) || { x: 0, y: 0, w: 400, h: 300 };
  let ratio = pixelRatio;
  const maxDim = 6000;
  const rawW = (box.w + padding * 2) * ratio;
  const rawH = (box.h + padding * 2) * ratio;
  if (rawW > maxDim || rawH > maxDim) ratio *= Math.min(maxDim / rawW, maxDim / rawH);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil((box.w + padding * 2) * ratio));
  canvas.height = Math.max(1, Math.ceil((box.h + padding * 2) * ratio));
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, box.w + padding * 2, box.h + padding * 2);
  ctx.translate(padding - box.x, padding - box.y);
  for (const shape of shapes) drawShape(ctx, shape);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("png");
  return blob;
}

function pageSize(format, orientation) {
  const table = { a4: [210, 297], a3: [297, 420] };
  let [w, h] = table[format] || table.a4;
  if (orientation === "landscape") [w, h] = [h, w];
  return [w, h];
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function exportPdfBlob(shapes, { title, format = "a4", orientation = "landscape" } = {}) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation, unit: "mm", format, compress: true });
  doc.setProperties({ title: title || "Чертёж", creator: "Чертёж" });
  try {
    const buffer = await loadFontBuffer();
    const b64 = bufferToBase64(buffer);
    doc.addFileToVFS("NotoSans-Regular.ttf", b64);
    doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
    doc.setFont("NotoSans", "normal");
  } catch (err) {
    console.warn("font embed failed", err);
  }

  const box = boundsOf(shapes) || { x: 0, y: 0, w: 400, h: 300 };
  const padding = 24;
  const [pageW, pageH] = pageSize(format, orientation);
  const margin = 10;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2;
  const drawW = box.w + padding * 2;
  const drawH = box.h + padding * 2;
  const fit = Math.min(availW / drawW, availH / drawH);
  const w = drawW * fit;
  const h = drawH * fit;
  const x = margin + (availW - w) / 2;
  const y = margin + (availH - h) / 2;

  const svgText = buildSvgDocument(shapes, { title, padding, background: "#ffffff" });
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:0;top:0;opacity:0.01;pointer-events:none;z-index:-1;";
  holder.innerHTML = svgText;
  document.body.appendChild(holder);
  const svgEl = holder.querySelector("svg");
  let vector = false;
  try {
    if (typeof doc.svg === "function") {
      await doc.svg(svgEl, { x, y, width: w, height: h });
      vector = true;
    }
  } catch (err) {
    console.warn("vector pdf failed", err);
  }
  holder.remove();
  if (!vector) {
    const png = await renderPngBlob(shapes, { pixelRatio: 2, padding });
    const dataUrl = await blobToDataUrl(png);
    doc.addImage(dataUrl, "PNG", x, y, w, h);
  }
  return doc.output("blob");
}
