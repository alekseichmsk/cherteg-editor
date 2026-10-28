import fs from "node:fs";
import { expect, test } from "@playwright/test";

async function worldToClient(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const svg = document.getElementById("stage");
    const world = document.getElementById("world");
    const pt = svg.createSVGPoint();
    pt.x = x;
    pt.y = y;
    const p = pt.matrixTransform(world.getScreenCTM());
    return { x: p.x, y: p.y };
  }, { x, y });
}

async function dragWorld(page, a, b) {
  const p1 = await worldToClient(page, a.x, a.y);
  const p2 = await worldToClient(page, b.x, b.y);
  await page.mouse.move(p1.x, p1.y);
  await page.mouse.down();
  await page.mouse.move(p2.x, p2.y, { steps: 12 });
  await page.mouse.up();
}

async function clickTool(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.waitForFunction(() => window.__editor);
});

test("draws a plan on a phone-sized canvas and exports files", async ({ page }, testInfo) => {
  const tool = page.getByRole("button", { name: "Линия", exact: true });
  const box = await tool.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);

  const selectBox = await page.getByRole("button", { name: "Выбор", exact: true }).boundingBox();
  if (testInfo.project.name === "mobile") {
    expect(box.x).toBeGreaterThan(selectBox.x + 10);
  } else {
    expect(box.y).toBeGreaterThan(selectBox.y + 10);
  }

  const grid = page.getByRole("button", { name: "Сетка", exact: true });
  if ((await grid.getAttribute("aria-pressed")) === "true") await grid.click();
  await expect(grid).toHaveAttribute("aria-pressed", "false");

  await clickTool(page, "Квадрат");
  await dragWorld(page, { x: 80, y: 120 }, { x: 200, y: 200 });

  await clickTool(page, "Линия");
  await dragWorld(page, { x: 80, y: 120 }, { x: 140, y: 40 });

  const afterFirst = await page.evaluate(() => window.__editor.getState());
  const square = afterFirst.shapes.find((shape) => shape.type === "rect");
  const firstLine = afterFirst.shapes.find((shape) => shape.type === "line");
  expect(square).toBeTruthy();
  expect(square.w).toBeCloseTo(square.h, 0);
  expect(firstLine).toBeTruthy();

  const origin = { x: square.x + square.w, y: square.y };
  const target = {
    x: origin.x + (firstLine.x2 - firstLine.x1),
    y: origin.y + (firstLine.y2 - firstLine.y1),
  };
  await dragWorld(page, origin, { x: target.x + 12, y: target.y + 9 });

  const lined = await page.evaluate(() => window.__editor.getState());
  const lines = lined.shapes.filter((shape) => shape.type === "line");
  expect(lines).toHaveLength(2);
  const second = lines[1];
  const vx1 = firstLine.x2 - firstLine.x1;
  const vy1 = firstLine.y2 - firstLine.y1;
  const vx2 = second.x2 - second.x1;
  const vy2 = second.y2 - second.y1;
  expect(vx2).toBeCloseTo(vx1, 0);
  expect(vy2).toBeCloseTo(vy1, 0);

  await page.getByRole("button", { name: "Пунктир" }).click();
  const dashed = await page.evaluate(() => window.__editor.getState().shapes.filter((s) => s.type === "line")[1].dashed);
  expect(dashed).toBe(true);

  await clickTool(page, "Размерная линия");
  await page.getByRole("button", { name: "Сплошная" }).click();
  await dragWorld(page, { x: 80, y: 80 }, { x: 280, y: 80 });
  await page.locator("#prop-label").fill("1950");
  await expect(page.locator("svg text").filter({ hasText: "1950" }).first()).toBeVisible();

  await clickTool(page, "Окружность с крестом");
  await dragWorld(page, { x: 160, y: 180 }, { x: 184, y: 180 });

  await clickTool(page, "Номер");
  await dragWorld(page, { x: 160, y: 150 }, { x: 160, y: 150 });
  await dragWorld(page, { x: 210, y: 150 }, { x: 210, y: 150 });
  const markers = await page.evaluate(() =>
    window.__editor.getState().shapes.filter((shape) => shape.type === "marker").map((shape) => shape.n),
  );
  expect(markers).toEqual([1, 2]);

  await clickTool(page, "Текст");
  await dragWorld(page, { x: 80, y: 280 }, { x: 80, y: 280 });
  const editor = page.locator("#text-editor-input");
  await expect(editor).toBeVisible();
  await editor.fill("Розетка 16А");
  await editor.press("Enter");
  await expect(page.locator("svg text").filter({ hasText: "Розетка 16А" })).toBeVisible();

  await clickTool(page, "Треугольник");
  await dragWorld(page, { x: 300, y: 140 }, { x: 380, y: 230 });

  await clickTool(page, "Линия со стрелкой");
  await dragWorld(page, { x: 300, y: 120 }, { x: 380, y: 100 });

  const counts = await page.evaluate(() => {
    const shapes = window.__editor.getState().shapes;
    return {
      n: shapes.length,
      types: shapes.map((shape) => shape.type),
    };
  });
  expect(counts.types).toEqual(expect.arrayContaining(["rect", "line", "dimension", "circle", "marker", "text", "triangle", "arrow"]));

  await clickTool(page, "Выбор");
  await page.keyboard.press("Escape");
  await page.locator("#btn-fit").click();
  const shot = testInfo.project.name === "mobile" ? "mobile-plan.png" : "desktop-plan.png";
  await page.screenshot({ path: `docs/screenshots/${shot}` });

  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  const afterUndo = await page.evaluate(() => window.__editor.getState().shapes.length);
  expect(afterUndo).toBe(counts.n - 1);
  await page.getByRole("button", { name: "Вернуть", exact: true }).click();

  await clickTool(page, "Выбор");
  await dragWorld(page, { x: 60, y: 60 }, { x: 400, y: 320 });
  const selected = await page.evaluate(() => window.__editor.getSelection().length);
  expect(selected).toBeGreaterThan(2);

  await page.getByRole("button", { name: "Дублировать", exact: true }).click();
  const duplicated = await page.evaluate(() => window.__editor.getState().shapes.length);
  expect(duplicated).toBeGreaterThan(afterUndo);

  const saved = await page.evaluate(() => localStorage.getItem("cherteg-editor:v1"));
  expect(saved).toContain("Розетка 16А");

  await page.getByRole("button", { name: "Пример", exact: true }).click();
  const exampleShot = testInfo.project.name === "mobile" ? "mobile-example.png" : "desktop-example.png";
  await page.screenshot({ path: `docs/screenshots/${exampleShot}` });

  if (testInfo.project.name !== "mobile") return;

  const before = await page.evaluate(() => window.__editor.getView().scale);
  await page.evaluate(() => {
    const el = document.getElementById("viewport");
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const fire = (type, id, x, y) => {
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: id,
          pointerType: "touch",
          clientX: x,
          clientY: y,
          isPrimary: id === 1,
        }),
      );
    };
    fire("pointerdown", 1, cx - 30, cy);
    fire("pointerdown", 2, cx + 30, cy);
    fire("pointermove", 1, cx - 80, cy + 10);
    fire("pointermove", 2, cx + 90, cy - 8);
    fire("pointerup", 1, cx - 80, cy + 10);
    fire("pointerup", 2, cx + 90, cy - 8);
  });
  const after = await page.evaluate(() => window.__editor.getView().scale);
  expect(after).toBeGreaterThan(before);

  const svgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт SVG", exact: true }).click();
  const svgFile = await svgDownload;
  const svgPath = await svgFile.path();
  const svgText = fs.readFileSync(svgPath, "utf8");
  expect(svgText).toContain("<svg");
  expect(svgText).toContain("1950");
  expect(svgText).toContain("Розетка 16А");

  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт PNG", exact: true }).click();
  const pngFile = await pngDownload;
  const pngBuf = fs.readFileSync(await pngFile.path());
  expect(pngBuf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

  await page.getByRole("button", { name: "Экспорт PDF", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Экспорт PDF" })).toBeVisible();
  await page.locator("#pdf-format").selectOption("a3");
  await page.locator("#pdf-orient").selectOption("portrait");
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать PDF" }).click();
  const pdfFile = await pdfDownload;
  const pdfBuf = fs.readFileSync(await pdfFile.path());
  expect(pdfBuf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdfBuf.length).toBeGreaterThan(2000);
  const pdfLatin = pdfBuf.toString("latin1");
  expect(pdfLatin).toContain("NotoSans");
});
