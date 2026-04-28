export type Pixel = { x: number; y: number };

const DIRS: Pixel[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function randomShape(size: number, maxBox: number): Pixel[] {
  for (let attempt = 0; attempt < 30; attempt++) {
    const cells: Pixel[] = [{ x: 0, y: 0 }];
    const set = new Set<string>(["0,0"]);
    let minX = 0,
      minY = 0,
      maxX = 0,
      maxY = 0;
    let stuck = false;
    while (cells.length < size) {
      const base = cells[Math.floor(Math.random() * cells.length)];
      const candidates = DIRS.map((d) => ({
        x: base.x + d.x,
        y: base.y + d.y,
      })).filter((p) => {
        if (set.has(`${p.x},${p.y}`)) return false;
        const nMinX = Math.min(minX, p.x);
        const nMinY = Math.min(minY, p.y);
        const nMaxX = Math.max(maxX, p.x);
        const nMaxY = Math.max(maxY, p.y);
        return nMaxX - nMinX < maxBox && nMaxY - nMinY < maxBox;
      });
      if (candidates.length === 0) {
        stuck = true;
        break;
      }
      const next = candidates[Math.floor(Math.random() * candidates.length)];
      cells.push(next);
      set.add(`${next.x},${next.y}`);
      minX = Math.min(minX, next.x);
      minY = Math.min(minY, next.y);
      maxX = Math.max(maxX, next.x);
      maxY = Math.max(maxY, next.y);
    }
    if (!stuck) {
      return cells.map((p) => ({ x: p.x - minX, y: p.y - minY }));
    }
  }
  return [{ x: 0, y: 0 }];
}

export type NoiseOptions = {
  width: number;
  height: number;
  gap: number;
  density: number;
  minCells: number;
  maxCells: number;
};

export function generateNoisePixels(opts: NoiseOptions): Pixel[] {
  const { width, height, gap, density, minCells, maxCells } = opts;

  const tileBox = Math.min(maxCells, 3);
  const stride = tileBox + gap;
  const cols = Math.floor((width + gap) / stride);
  const rows = Math.floor((height + gap) / stride);
  const offsetX = Math.floor((width - (cols * stride - gap)) / 2);
  const offsetY = Math.floor((height - (rows * stride - gap)) / 2);

  const placed: Pixel[] = [];
  const skipProb = 1 - density / 100;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() < skipProb) continue;
      const size =
        minCells + Math.floor(Math.random() * (maxCells - minCells + 1));
      const shape = randomShape(size, tileBox);
      const xs = shape.map((p) => p.x);
      const ys = shape.map((p) => p.y);
      const w = Math.max(...xs) + 1;
      const h = Math.max(...ys) + 1;
      void w;
      void h;
      const baseX = offsetX + c * stride;
      const baseY = offsetY + r * stride;
      for (const p of shape) {
        const px = baseX + p.x;
        const py = baseY + p.y;
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        placed.push({ x: px, y: py });
      }
    }
  }

  return placed;
}

export function pixelsToSvg(
  pixels: Pixel[],
  width: number,
  height: number,
  color: string,
  opacity: number,
): string {
  const rects = pixels
    .map((p) => `<rect x="${p.x}" y="${p.y}" width="1" height="1"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges" fill="${color}" fill-opacity="${opacity}">${rects}</svg>`;
}
