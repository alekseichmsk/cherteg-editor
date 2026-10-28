/**
 * Snapping for technical sketches.
 * Endpoints stick to vertices, circle centres and the nearest point on a segment.
 * While drawing a line, the free end also sticks to 0/30/45/60/90°,
 * to lines parallel or perpendicular to existing ones, and — when close —
 * to the same length (so a second oblique edge matches the first).
 */

import { dist, projectPointToSegment } from "./geometry.js";

const DEG = Math.PI / 180;
const FIXED_ANGLES = [0, 30, 45, 60, 90, 120, 135, 150].map((d) => d * DEG);
const FIXED_TOL = 6 * DEG;
const PARALLEL_TOL = 8 * DEG;
const PARALLEL_BONUS = 1.2 * DEG;

const LABELS = {
  vertex: "Вершина",
  center: "Центр",
  segment: "На линии",
  parallel: "Параллельно",
  "parallel-length": "Параллельно и та же длина",
  perpendicular: "Перпендикуляр",
  angle: "Угол",
  align: "Выравнивание",
  grid: "Сетка",
  free: "",
};

function angMod(angle) {
  let a = angle % Math.PI;
  if (a < 0) a += Math.PI;
  return a;
}

function lineAngleDistance(a, b) {
  const d = Math.abs(angMod(a) - angMod(b));
  return Math.min(d, Math.PI - d);
}

export function tiltDegrees(angle) {
  if (angle == null || Number.isNaN(angle)) return null;
  let deg = Math.abs((angle * 180) / Math.PI) % 180;
  if (deg > 90) deg = 180 - deg;
  return Math.round(deg);
}

export function describeSnap(result) {
  if (!result || result.kind === "free") return "";
  const name = LABELS[result.kind] || "";
  if (
    result.angle != null &&
    (result.kind === "angle" ||
      result.kind === "parallel" ||
      result.kind === "parallel-length" ||
      result.kind === "perpendicular")
  ) {
    const deg = tiltDegrees(result.angle);
    return deg == null ? name : `${name} ${deg}°`;
  }
  return name;
}

export function collectGeometry(shapes, excludeIds) {
  const points = [];
  const segments = [];
  for (const shape of shapes || []) {
    if (excludeIds && excludeIds.has(shape.id)) continue;
    if (shape.type === "line" || shape.type === "arrow" || shape.type === "dimension") {
      points.push({ x: shape.x1, y: shape.y1, kind: "vertex", shapeId: shape.id });
      points.push({ x: shape.x2, y: shape.y2, kind: "vertex", shapeId: shape.id });
      segments.push({ x1: shape.x1, y1: shape.y1, x2: shape.x2, y2: shape.y2, id: shape.id });
    } else if (shape.type === "rect") {
      const corners = [
        { x: shape.x, y: shape.y },
        { x: shape.x + shape.w, y: shape.y },
        { x: shape.x + shape.w, y: shape.y + shape.h },
        { x: shape.x, y: shape.y + shape.h },
      ];
      for (const corner of corners) points.push({ ...corner, kind: "vertex", shapeId: shape.id });
      for (let i = 0; i < 4; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % 4];
        segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, id: shape.id });
      }
    } else if (shape.type === "triangle" && shape.points?.length === 3) {
      for (const p of shape.points) points.push({ x: p.x, y: p.y, kind: "vertex", shapeId: shape.id });
      for (let i = 0; i < 3; i++) {
        const a = shape.points[i];
        const b = shape.points[(i + 1) % 3];
        segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, id: shape.id });
      }
    } else if (shape.type === "circle" || shape.type === "marker") {
      points.push({ x: shape.cx, y: shape.cy, kind: "center", shapeId: shape.id });
    } else if (shape.type === "text") {
      points.push({ x: shape.x, y: shape.y, kind: "vertex", shapeId: shape.id });
    }
  }
  return { points, segments };
}

function gridPoint(cursor, gridSize) {
  const g = gridSize || 20;
  return {
    x: Math.round(cursor.x / g) * g,
    y: Math.round(cursor.y / g) * g,
  };
}

function finish(best, cursor, opt, points) {
  const x = best ? best.x : cursor.x;
  const y = best ? best.y : cursor.y;
  const kind = best ? best.kind : "free";
  const guides = [];
  if (best?.alignX != null) guides.push({ type: "v", x: best.alignX });
  if (best?.alignY != null) guides.push({ type: "h", y: best.alignY });
  if (!best?.alignX || !best?.alignY) {
    const others = points.filter((p) => Math.hypot(p.x - x, p.y - y) > 0.75);
    if (others.some((p) => Math.abs(p.x - x) < 0.6)) guides.push({ type: "v", x });
    if (others.some((p) => Math.abs(p.y - y) < 0.6)) guides.push({ type: "h", y });
  }
  if (kind === "vertex" || kind === "center" || kind === "parallel-length" || kind === "segment") {
    guides.push({ type: "point", x, y });
  }
  if (best?.seg && (kind === "parallel" || kind === "parallel-length" || kind === "perpendicular" || kind === "segment")) {
    guides.push({ type: "seg", x1: best.seg.x1, y1: best.seg.y1, x2: best.seg.x2, y2: best.seg.y2 });
  }
  if (
    opt.origin &&
    (kind === "parallel" || kind === "parallel-length" || kind === "perpendicular" || kind === "angle")
  ) {
    const ang = Math.atan2(y - opt.origin.y, x - opt.origin.x);
    const ext = 48 / (opt.scale || 1);
    guides.push({
      type: "ray",
      x1: opt.origin.x - Math.cos(ang) * ext,
      y1: opt.origin.y - Math.sin(ang) * ext,
      x2: x + Math.cos(ang) * ext,
      y2: y + Math.sin(ang) * ext,
    });
  }
  const angle = best?.angle ?? (opt.origin ? Math.atan2(y - opt.origin.y, x - opt.origin.x) : null);
  const result = { x, y, kind, guides, angle, seg: best?.seg || null };
  result.label = describeSnap(result);
  return result;
}

/**
 * @param {{x:number,y:number}} cursor
 * @param {object} opt
 * @param {Array} opt.shapes
 * @param {{x:number,y:number}|null} [opt.origin] anchored end of a line being drawn
 * @param {number} [opt.scale]
 * @param {boolean} [opt.grid]
 * @param {number} [opt.gridSize]
 * @param {boolean} [opt.snap]
 * @param {boolean} [opt.coarse]
 * @param {boolean} [opt.shift] force 45° steps
 * @param {Set<string>} [opt.excludeIds]
 */
export function snapPointer(cursor, opt = {}) {
  const scale = opt.scale || 1;
  const tol = (opt.coarse ? 22 : 14) / scale;
  if (opt.snap === false) {
    if (opt.grid) {
      const g = gridPoint(cursor, opt.gridSize);
      return finish({ ...g, kind: "grid" }, cursor, opt, []);
    }
    return finish(null, cursor, opt, []);
  }

  const { points, segments } = collectGeometry(opt.shapes, opt.excludeIds);
  let best = null;

  function consider(x, y, kind, maxDist, bias, extra = {}) {
    const d = Math.hypot(cursor.x - x, cursor.y - y);
    if (d > maxDist) return;
    const score = d + bias;
    if (!best || score < best.score - 1e-6) {
      best = { x, y, kind, score, ...extra };
    }
  }

  for (const p of points) {
    consider(p.x, p.y, p.kind === "center" ? "center" : "vertex", tol, -4, { shapeId: p.shapeId });
  }

  for (const seg of segments) {
    const proj = projectPointToSegment(cursor, seg);
    consider(proj.x, proj.y, "segment", tol * 0.95, 1, { seg });
  }

  let alignX = null;
  let alignDx = tol;
  let alignY = null;
  let alignDy = tol;
  for (const p of points) {
    const dx = Math.abs(cursor.x - p.x);
    const dy = Math.abs(cursor.y - p.y);
    if (dx < alignDx) {
      alignDx = dx;
      alignX = p.x;
    }
    if (dy < alignDy) {
      alignDy = dy;
      alignY = p.y;
    }
  }
  if (alignX != null && alignY != null) {
    consider(alignX, alignY, "align", tol * 1.45, -1, { alignX, alignY });
  } else if (alignX != null) {
    consider(alignX, cursor.y, "align", tol, 2, { alignX });
  } else if (alignY != null) {
    consider(cursor.x, alignY, "align", tol, 2, { alignY });
  }

  if (opt.origin) {
    const origin = opt.origin;
    const vx = cursor.x - origin.x;
    const vy = cursor.y - origin.y;
    const cursorLen = Math.hypot(vx, vy);
    const cursorAng = Math.atan2(vy, vx);

    if (cursorLen > 1) {
      const angleCandidates = [];
      const fixed = opt.shift ? [0, 45, 90, 135].map((d) => d * DEG) : FIXED_ANGLES;
      for (const angle of fixed) {
        angleCandidates.push({ angle, source: "fixed", bonus: 0 });
      }
      if (!opt.shift) {
        for (const seg of segments) {
          const ang = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1);
          const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
          if (len < 1e-3) continue;
          angleCandidates.push({ angle: ang, source: "parallel", bonus: PARALLEL_BONUS, seg, len });
          angleCandidates.push({
            angle: ang + Math.PI / 2,
            source: "perpendicular",
            bonus: 0.35 * DEG,
            seg,
            len,
          });
        }
      }

      let chosen = null;
      for (const candidate of angleCandidates) {
        const diff = lineAngleDistance(cursorAng, candidate.angle);
        const tolAng = opt.shift ? Math.PI : candidate.source === "fixed" ? FIXED_TOL : PARALLEL_TOL;
        if (diff > tolAng + (candidate.bonus || 0)) continue;
        const score = diff - (candidate.bonus || 0);
        if (!chosen || score < chosen.score) chosen = { ...candidate, diff, score };
      }

      if (chosen) {
        let ux = Math.cos(chosen.angle);
        let uy = Math.sin(chosen.angle);
        let t = vx * ux + vy * uy;
        if (t < 0) {
          ux = -ux;
          uy = -uy;
          t = -t;
        }
        const footX = origin.x + ux * t;
        const footY = origin.y + uy * t;
        const perp = Math.hypot(cursor.x - footX, cursor.y - footY);
        const perpLimit = opt.shift ? Infinity : Math.max(tol * 1.45, 12 / scale);
        if (perp <= perpLimit) {
          let len = t;
          let kind = chosen.source === "fixed" ? "angle" : chosen.source;
          let seg = chosen.seg || null;
          if (!opt.shift && (chosen.source === "parallel" || chosen.source === "perpendicular")) {
            let bestLen = null;
            let bestLd = Infinity;
            let bestSeg = seg;
            for (const s of segments) {
              const sang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
              const target = chosen.source === "perpendicular" ? sang + Math.PI / 2 : sang;
              if (lineAngleDistance(target, chosen.angle) > 2 * DEG) continue;
              const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
              const ld = Math.abs(t - L);
              const lTol = Math.max(tol * 1.6, L * 0.12);
              if (ld <= lTol && ld < bestLd) {
                bestLd = ld;
                bestLen = L;
                bestSeg = s;
              }
            }
            if (bestLen != null) {
              len = bestLen;
              if (chosen.source === "parallel") kind = "parallel-length";
              seg = bestSeg;
            }
          }
          const px = origin.x + ux * len;
          const py = origin.y + uy * len;
          const bias = kind === "parallel-length" ? -12 : kind === "parallel" ? -2 : 0;
          const maxDist = kind === "parallel-length" ? Math.max(tol * 2.4, perpLimit) : perpLimit + 0.01;
          consider(px, py, kind, maxDist, bias, { seg, angle: Math.atan2(uy, ux) });
        }
      }

      if (!opt.shift) {
        for (const seg of segments) {
          const svx = seg.x2 - seg.x1;
          const svy = seg.y2 - seg.y1;
          const L = Math.hypot(svx, svy);
          if (L < 1e-3) continue;
          for (const sign of [1, -1]) {
            consider(origin.x + sign * svx, origin.y + sign * svy, "parallel-length", tol * 2.4, -16, {
              seg,
              angle: Math.atan2(sign * svy, sign * svx),
            });
          }
        }
      }
    }
  }

  if (!best && opt.grid) {
    const g = gridPoint(cursor, opt.gridSize);
    return finish({ ...g, kind: "grid" }, cursor, opt, points);
  }
  return finish(best, cursor, opt, points);
}
