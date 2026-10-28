import fs from "node:fs";
import { expect, test } from "@playwright/test";

async function worldToClient(page, x, y) {
  return page.evaluate(
    ({ x, y }) => {
      const svg = document.getElementById("stage");
      const world = document.getElementById("world");
      const pt = svg.createSVGPoint();
      pt.x = x;
      pt.y = y;
      const p = pt.matrixTransform(world.getScreenCTM());
      return { x: p.x, y: p.y };
    },
    { x, y },
  );
}

async function touchDrag(page, a, b) {
  const p1 = await worldToClient(page, a.x, a.y);
  const p2 = await worldToClient(page, b.x, b.y);
  await page.evaluate(
    ({ p1, p2 }) => {
      const el = document.getElementById("viewport");
      const fire = (type, x, y) => {
        el.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: "touch",
            clientX: x,
            clientY: y,
            isPrimary: true,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
          }),
        );
      };
      fire("pointerdown", p1.x, p1.y);
      const steps = 8;
      for (let i = 1; i <= steps; i += 1) {
        fire("pointermove", p1.x + ((p2.x - p1.x) * i) / steps, p1.y + ((p2.y - p1.y) * i) / steps);
      }
      fire("pointerup", p2.x, p2.y);
    },
    { p1, p2 },
  );
}

async function touchTap(page, world) {
  const p = await worldToClient(page, world.x, world.y);
  await page.evaluate((point) => {
    const el = document.getElementById("viewport");
    const fire = (type) => {
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: "touch",
          clientX: point.x,
          clientY: point.y,
          isPrimary: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
        }),
      );
    };
    fire("pointerdown");
    fire("pointerup");
  }, p);
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.waitForFunction(() => window.__editor);
  await page.evaluate(() => document.fonts.ready);
});

test("text frame matches Cyrillic glyphs, and shapes can hold a centred label", async ({ page }, testInfo) => {
  const grid = page.getByRole("button", { name: "Сетка", exact: true });
  if ((await grid.getAttribute("aria-pressed")) === "true") await grid.click();

  await page.getByRole("button", { name: "Текст", exact: true }).click();
  await touchTap(page, { x: 48, y: 70 });
  const editor = page.locator("#text-editor-input");
  await expect(editor).toBeVisible();
  await editor.fill("Розетка 16А");
  await editor.press("Enter");
  await page.locator("#font-size").evaluate((el) => {
    el.value = "32";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Выбор", exact: true }).click();

  async function frameDelta() {
    return page.evaluate(() => {
      const text = document.querySelector('[data-type="text"] text');
      const frame = document.querySelector('[data-role="text-frame-rect"]');
      const ink = text.getBoundingClientRect();
      const box = frame.getBoundingClientRect();
      return {
        left: ink.left - box.left,
        top: ink.top - box.top,
        right: box.right - ink.right,
        bottom: box.bottom - ink.bottom,
      };
    });
  }

  const fitted = await frameDelta();
  for (const side of ["left", "top", "right", "bottom"]) {
    expect(fitted[side], side).toBeGreaterThan(0);
    expect(fitted[side], side).toBeLessThan(4);
  }

  await page.evaluate(() => window.__editor.setView({ scale: 2.4, tx: 20, ty: 30 }));
  const zoomed = await frameDelta();
  for (const side of ["left", "top", "right", "bottom"]) {
    expect(zoomed[side], `zoom ${side}`).toBeGreaterThan(0);
    expect(zoomed[side], `zoom ${side}`).toBeLessThan(4);
  }

  if (testInfo.project.name === "mobile") {
    await page.evaluate(() => window.__editor.setView({ scale: 1.45, tx: 12, ty: 48 }));
    await page.screenshot({ path: "docs/screenshots/mobile-text-frame.png" });
  }

  await page.evaluate(() => window.__editor.setView({ scale: 1, tx: 28, ty: 20 }));
  await page.getByRole("button", { name: "Прямоугольник", exact: true }).click();
  await touchDrag(page, { x: 40, y: 180 }, { x: 250, y: 320 });
  await page.getByRole("button", { name: "Текст в фигуре", exact: true }).click();
  await expect(editor).toBeVisible();
  await editor.fill("Холодильник");
  await editor.press("Enter");

  await page.getByRole("button", { name: "Окружность с крестом", exact: true }).click();
  await touchDrag(page, { x: 300, y: 230 }, { x: 336, y: 230 });
  await page.getByRole("button", { name: "Текст в фигуре", exact: true }).click();
  await editor.fill("Розетка");
  await editor.press("Enter");

  await page.getByRole("button", { name: "Линия", exact: true }).click();
  await touchDrag(page, { x: 40, y: 360 }, { x: 220, y: 360 });
  await page.getByRole("button", { name: "Текст в фигуре", exact: true }).click();
  await editor.fill("Стена");
  await editor.press("Enter");

  const placed = await page.evaluate(() => {
    const state = window.__editor.getState();
    const rect = state.shapes.find((shape) => shape.type === "rect");
    const circle = state.shapes.find((shape) => shape.type === "circle");
    const line = state.shapes.find((shape) => shape.type === "line");
    const rectEl = document.querySelector('[data-type="rect"]');
    const text = rectEl.querySelector(".shape-caption text");
    const box = rectEl.querySelector("rect").getBoundingClientRect();
    const ink = text.getBoundingClientRect();
    return {
      captions: { rect: rect.caption, circle: circle.caption, line: line.caption },
      dx: Math.abs(ink.left + ink.width / 2 - (box.left + box.width / 2)),
      dy: Math.abs(ink.top + ink.height / 2 - (box.top + box.height / 2)),
    };
  });
  expect(placed.captions).toEqual({ rect: "Холодильник", circle: "Розетка", line: "Стена" });
  expect(placed.dx).toBeLessThan(3);
  expect(placed.dy).toBeLessThan(4);

  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Выбор", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.locator("#btn-fit").click();
    await page.screenshot({ path: "docs/screenshots/mobile-shape-label.png" });
    await page.evaluate(() => window.__editor.setView({ scale: 1, tx: 28, ty: 20 }));
  }

  const beforeMove = await page.evaluate(() => {
    const rect = window.__editor.getState().shapes.find((shape) => shape.type === "rect");
    return { x: rect.x, y: rect.y };
  });
  await page.getByRole("button", { name: "Выбор", exact: true }).click();
  await touchDrag(page, { x: beforeMove.x + 40, y: beforeMove.y + 40 }, { x: beforeMove.x + 90, y: beforeMove.y + 70 });
  const moved = await page.evaluate(() => {
    const rect = window.__editor.getState().shapes.find((shape) => shape.type === "rect");
    const rectEl = document.querySelector('[data-type="rect"]');
    const text = rectEl.querySelector(".shape-caption text");
    const box = rectEl.querySelector("rect").getBoundingClientRect();
    const ink = text.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      caption: rect.caption,
      dx: Math.abs(ink.left + ink.width / 2 - (box.left + box.width / 2)),
      dy: Math.abs(ink.top + ink.height / 2 - (box.top + box.height / 2)),
    };
  });
  expect(moved.x).toBeGreaterThan(beforeMove.x + 20);
  expect(moved.caption).toBe("Холодильник");
  expect(moved.dx).toBeLessThan(3);
  expect(moved.dy).toBeLessThan(4);

  await page.getByRole("button", { name: "Дублировать", exact: true }).click();
  const copies = await page.evaluate(() => window.__editor.getState().shapes.filter((shape) => shape.caption === "Холодильник").length);
  expect(copies).toBe(2);

  await page.locator("#font-size").evaluate((el) => {
    el.value = "22";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Цвет линии #c0392b" }).click();
  const styled = await page.evaluate(() => {
    const id = window.__editor.getSelection()[0];
    const shape = window.__editor.getState().shapes.find((item) => item.id === id);
    const node = document.querySelector(`[data-id="${id}"] .shape-caption text:last-of-type`);
    return {
      size: shape.fontSize,
      stroke: shape.stroke,
      fill: node.getAttribute("fill"),
      fontSize: node.getAttribute("font-size"),
    };
  });
  expect(styled.size).toBe(22);
  expect(styled.stroke).toBe("#c0392b");
  expect(styled.fill).toBe("#c0392b");
  expect(Number(styled.fontSize)).toBe(22);

  await page.waitForTimeout(500);
  const center = await page.evaluate(() => {
    const id = window.__editor.getSelection()[0];
    const shape = window.__editor.getState().shapes.find((item) => item.id === id);
    return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 };
  });
  await touchTap(page, center);
  await touchTap(page, center);
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue("Холодильник");
  await editor.press("Escape");

  if (testInfo.project.name !== "mobile") return;

  const svgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт SVG", exact: true }).click();
  const svgText = fs.readFileSync(await (await svgDownload).path(), "utf8");
  expect(svgText).toContain("Холодильник");
  expect(svgText).toContain("Розетка");

  await page.getByRole("button", { name: "Экспорт PDF", exact: true }).click();
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать PDF" }).click();
  const pdf = fs.readFileSync(await (await pdfDownload).path());
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  const latin = pdf.toString("latin1");
  expect(latin).toContain("NotoSans");
  expect(latin).not.toMatch(/\/Subtype\s*\/Image/);
});
