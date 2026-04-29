import { useEffect, useMemo, useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import {
  Copy,
  Download,
  Github,
  Palette,
  RefreshCw,
  Settings2,
  Sparkles,
  Info,
} from "lucide-react";
import {
  generateNoisePixels,
  pixelsToSvg,
} from "./components/noise-generator";
import { Slider } from "./components/ui/slider";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip";

export default function App() {
  const [width, setWidth] = useState(256);
  const [height, setHeight] = useState(160);
  const [density, setDensity] = useState(100);
  const [gap, setGap] = useState(3);
  const [minCells, setMinCells] = useState(1);
  const [maxCells, setMaxCells] = useState(6);
  const [color, setColor] = useState("#000000");
  const [opacity, setOpacity] = useState(0.4);
  const [bg, setBg] = useState("#ffffff");
  const [scale, setScale] = useState(4);
  const [autoZoom, setAutoZoom] = useState(true);
  const [previewSize, setPreviewSize] = useState({ w: 0, h: 0 });
  const [seed, setSeed] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);

  // Track preview viewport size for auto-zoom
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setPreviewSize({
        w: entry.contentRect.width,
        h: entry.contentRect.height,
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Best zoom for current canvas given available preview area
  const autoScale = useMemo(() => {
    if (!previewSize.w || !previewSize.h) return scale;
    const padding = 96; // p-8 (×2) + frame padding (16×2)
    const availW = Math.max(80, previewSize.w - padding);
    const availH = Math.max(80, previewSize.h - padding);
    const fit = Math.min(availW / width, availH / height);
    return Math.max(1, Math.min(12, Math.round(fit)));
  }, [width, height, previewSize, scale]);

  const effectiveScale = autoZoom ? autoScale : scale;

  const { svg, count } = useMemo(() => {
    void seed;
    const pixels = generateNoisePixels({
      width,
      height,
      gap,
      density,
      minCells,
      maxCells,
    });
    return {
      svg: pixelsToSvg(pixels, width, height, color, opacity),
      count: pixels.length,
    };
  }, [width, height, gap, density, color, opacity, minCells, maxCells, seed]);

  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  const renderPng = async (): Promise<Blob | null> => {
    const img = new Image();
    img.src = dataUrl;
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/png"),
    );
  };

  const copyPng = async () => {
    try {
      const blob = await renderPng();
      if (!blob) throw new Error("render failed");
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      toast.success("PNG copied to clipboard");
    } catch (e) {
      toast.error("Copy failed: " + (e as Error).message);
    }
  };

  const downloadPng = async () => {
    const blob = await renderPng();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maskbit-${width}x${height}.png`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("PNG downloaded");
  };

  const downloadSvg = () => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `maskbit-${width}x${height}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("SVG downloaded");
  };

  const regenerate = () => setSeed((s) => s + 1);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.matches("input, textarea")) return;
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        regenerate();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        downloadSvg();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [svg]);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="dark size-full flex flex-col bg-background text-foreground">
        <Toaster theme="dark" position="bottom-right" />

        {/* Top bar */}
        <header className="h-12 shrink-0 border-b border-border flex items-center px-4 gap-3">
          <BrandMark />
          <span className="hidden sm:inline text-xs text-muted-foreground">
            Tetromino-style SVG mask generator
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" asChild>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View on GitHub"
              >
                <Github className="size-4" />
              </a>
            </Button>
          </div>
        </header>

        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          {/* Sidebar */}
          <aside className="w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-border flex flex-col bg-card/30">
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <Section title="Canvas" icon={<Settings2 className="size-3.5" />}>
                <SliderRow
                  label="Width"
                  value={width}
                  setValue={setWidth}
                  min={20}
                  max={1024}
                  unit="px"
                  showInput
                />
                <SliderRow
                  label="Height"
                  value={height}
                  setValue={setHeight}
                  min={20}
                  max={1024}
                  unit="px"
                  showInput
                />
                <ZoomRow
                  value={effectiveScale}
                  setScale={setScale}
                  autoZoom={autoZoom}
                  setAutoZoom={setAutoZoom}
                />
              </Section>

              <Separator />

              <Section title="Pattern" icon={<Sparkles className="size-3.5" />}>
                <SliderRow
                  label="Density"
                  tip="Probability of placing a shape per scan position"
                  value={density}
                  setValue={setDensity}
                  min={1}
                  max={40}
                  unit="%"
                />
                <SliderRow
                  label="Shape gap"
                  tip="Empty pixels between adjacent shapes"
                  value={gap}
                  setValue={setGap}
                  min={1}
                  max={20}
                  unit="px"
                />
                <div className="grid grid-cols-2 gap-3">
                  <SliderRow
                    label="Min cells"
                    value={minCells}
                    setValue={setMinCells}
                    min={1}
                    max={maxCells}
                  />
                  <SliderRow
                    label="Max cells"
                    value={maxCells}
                    setValue={setMaxCells}
                    min={minCells}
                    max={10}
                  />
                </div>
              </Section>

              <Separator />

              <Section title="Color" icon={<Palette className="size-3.5" />}>
                <div className="grid grid-cols-2 gap-3">
                  <ColorField
                    label="Pixel"
                    value={color}
                    setValue={setColor}
                  />
                  <ColorField
                    label="Background"
                    value={bg}
                    setValue={setBg}
                  />
                </div>
                <SliderRow
                  label="Opacity"
                  value={Math.round(opacity * 100)}
                  setValue={(v) => setOpacity(v / 100)}
                  min={0}
                  max={100}
                  unit="%"
                />
              </Section>
            </div>

            {/* Sticky action footer */}
            <div className="border-t border-border p-3 space-y-2 bg-card/60 backdrop-blur-sm">
              <Button onClick={regenerate} className="w-full" size="lg">
                <RefreshCw className="size-4" />
                Regenerate
                <kbd className="ml-auto text-[10px] font-mono opacity-60 bg-foreground/10 text-current px-1.5 py-0.5 rounded">
                  R
                </kbd>
              </Button>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyPng}
                  className="font-normal"
                >
                  <Copy className="size-3.5" />
                  PNG
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadPng}
                  className="font-normal"
                >
                  <Download className="size-3.5" />
                  PNG
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadSvg}
                  className="font-normal"
                >
                  <Download className="size-3.5" />
                  SVG
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground text-center font-mono">
                {count} cells · {width} × {height}
              </p>
            </div>
          </aside>

          {/* Preview */}
          <main className="flex-1 relative overflow-hidden bg-background bg-checker">
            {/* Inner scroll container — keeps overlays fixed relative to <main> */}
            <div ref={previewRef} className="absolute inset-0 overflow-auto">
              <div className="min-h-full min-w-full w-fit flex items-center justify-center p-8">
                <div
                  className="rounded-md shadow-2xl ring-1 ring-border/60"
                  style={{ background: bg, padding: 16 }}
                >
                  <img
                    src={dataUrl}
                    width={width * effectiveScale}
                    height={height * effectiveScale}
                    style={{
                      width: width * effectiveScale,
                      height: height * effectiveScale,
                      maxWidth: "none",
                      imageRendering: "pixelated",
                      display: "block",
                    }}
                    alt={`Generated noise mask, ${width} by ${height} pixels`}
                  />
                </div>
              </div>
            </div>

            {/* Floating dimension chip — stays fixed over preview */}
            <div className="pointer-events-none absolute top-4 right-4 px-2.5 py-1 rounded-md bg-card/80 backdrop-blur border border-border text-[11px] font-mono text-muted-foreground tabular-nums z-10">
              {width} × {height} · {effectiveScale}×{autoZoom ? " (auto)" : ""}
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

/* ---------- subcomponents ---------- */

function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      {/* Pixel-art logo: a tetromino glyph */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 8 8"
        aria-hidden
        className="text-foreground"
      >
        <rect x="0" y="0" width="3" height="3" fill="currentColor" />
        <rect x="3" y="0" width="2" height="2" fill="currentColor" opacity="0.6" />
        <rect x="0" y="3" width="2" height="2" fill="currentColor" opacity="0.6" />
        <rect x="3" y="3" width="5" height="5" fill="currentColor" />
        <rect x="5" y="0" width="3" height="2" fill="currentColor" opacity="0.3" />
        <rect x="0" y="5" width="2" height="3" fill="currentColor" opacity="0.3" />
      </svg>
      <span className="font-mono font-semibold text-sm tracking-tight">
        maskbit
      </span>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        {icon}
        <span>{title}</span>
      </div>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

function SliderRow({
  label,
  value,
  setValue,
  min,
  max,
  unit = "",
  tip,
  showInput = false,
}: {
  label: string;
  value: number;
  setValue: (v: number) => void;
  min: number;
  max: number;
  unit?: string;
  tip?: string;
  showInput?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground font-normal flex items-center gap-1">
          {label}
          {tip ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3 opacity-60 hover:opacity-100 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[220px]">
                {tip}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </Label>
        {showInput ? (
          <Input
            type="number"
            min={min}
            max={max}
            value={value}
            onChange={(e) =>
              setValue(
                Math.max(min, Math.min(max, Number(e.target.value) || 0)),
              )
            }
            className="h-6 w-16 px-1.5 text-xs font-mono tabular-nums text-right"
          />
        ) : (
          <span className="text-xs font-mono tabular-nums text-foreground">
            {value}
            {unit}
          </span>
        )}
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={(v) => setValue(v[0])}
      />
    </div>
  );
}

function ZoomRow({
  value,
  setScale,
  autoZoom,
  setAutoZoom,
}: {
  value: number;
  setScale: (v: number) => void;
  autoZoom: boolean;
  setAutoZoom: (v: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground font-normal flex items-center gap-1.5">
          Preview zoom
          <button
            type="button"
            onClick={() => setAutoZoom(!autoZoom)}
            className={
              "px-1.5 py-0.5 text-[9px] font-mono uppercase rounded border transition-colors " +
              (autoZoom
                ? "bg-foreground/15 border-foreground/40 text-foreground"
                : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground")
            }
            title={autoZoom ? "Auto-fit on (click to set manually)" : "Auto-fit off (click to enable)"}
            aria-pressed={autoZoom}
          >
            Auto
          </button>
        </Label>
        <span className="text-xs font-mono tabular-nums text-foreground">
          {value}×
        </span>
      </div>
      <Slider
        value={[value]}
        min={1}
        max={12}
        step={1}
        onValueChange={(v) => {
          if (autoZoom) setAutoZoom(false);
          setScale(v[0]);
        }}
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  setValue,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground font-normal">
        {label}
      </Label>
      <div className="relative h-9 rounded-md border border-border overflow-hidden hover:border-foreground/40 transition-colors">
        <input
          type="color"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
          aria-label={`${label} color`}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: value }}
        />
        <div className="absolute inset-x-0 bottom-0 px-2 py-0.5 text-[10px] font-mono uppercase bg-black/40 text-white tabular-nums pointer-events-none">
          {value}
        </div>
      </div>
    </div>
  );
}
