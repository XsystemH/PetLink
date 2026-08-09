import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  PET_PARTS,
  calculateImagePlacement,
  type PetPartId,
  type PetPartSource,
  type PetPartSources,
} from "../lib/generate-pet";

interface PetPartsEditorProps {
  value: PetPartSources;
  onChange: (value: PetPartSources) => void;
}

interface EyeDropperConstructor {
  new(): { open(): Promise<{ sRGBHex: string }> };
}

export function PetPartsEditor({ value, onChange }: PetPartsEditorProps) {
  function update(partId: PetPartId, patch: Partial<PetPartSource>) {
    onChange({ ...value, [partId]: { ...value[partId], ...patch } });
  }

  async function pickScreenColor(partId: PetPartId) {
    const EyeDropper = (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper;
    if (!EyeDropper) {
      document.getElementById(`part-color-${partId}`)?.click();
      return;
    }
    try {
      const result = await new EyeDropper().open();
      update(partId, { color: result.sRGBHex, file: null });
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "AbortError") throw error;
    }
  }

  return (
    <div className="parts-editor">
      <div className="parts-help">
        每个部件都可以单独选择照片或纯色。上传后在虚线框内拖动照片，并用缩放滑杆确定最终截取位置。
      </div>
      <div className="parts-grid">
        {PET_PARTS.map((part) => {
          const source = value[part.id];
          return (
            <article className={`part-card ${!source.enabled ? "disabled" : ""}`} key={part.id}>
              <PartPreview
                source={source}
                shape={part.shape}
                mirrored={part.id === "ear-right"}
                bounds={part.bounds}
                label={part.label}
                onCropChange={(patch) => update(part.id, patch)}
              />
              <div className="part-card-copy">
                <strong>{part.label}</strong>
                <small>{source.file ? source.file.name : "纯色填充"}</small>
              </div>
              <div className="part-card-actions">
                <label className="part-upload">
                  选择照片
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={!source.enabled}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) update(part.id, { file, offsetX: 0, offsetY: 0, zoom: 1 });
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <label className="part-palette" title="打开调色盘">
                  <i style={{ backgroundColor: source.color }} />
                  调色盘
                  <input
                    id={`part-color-${part.id}`}
                    type="color"
                    value={source.color}
                    disabled={!source.enabled}
                    onChange={(event) => update(part.id, { color: event.target.value, file: null })}
                  />
                </label>
                <button type="button" disabled={!source.enabled} onClick={() => void pickScreenColor(part.id)}>取色器</button>
              </div>
              {source.file && source.enabled && (
                <div className="part-crop-controls">
                  <label>
                    <span>缩放 <small>{Math.round(source.zoom * 100)}%</small></span>
                    <input type="range" min="1" max="3" step="0.05" value={source.zoom} onChange={(event) => update(part.id, { zoom: Number(event.target.value) })} />
                  </label>
                  <button type="button" onClick={() => update(part.id, { offsetX: 0, offsetY: 0, zoom: 1 })}>居中复位</button>
                </div>
              )}
              {part.optional && (
                <label className="part-enabled">
                  <input type="checkbox" checked={source.enabled} onChange={(event) => update(part.id, { enabled: event.target.checked })} />
                  启用耳朵
                </label>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PartPreview({ source, shape, mirrored, bounds, label, onCropChange }: {
  source: PetPartSource;
  shape: "circle" | "capsule" | "ear";
  mirrored: boolean;
  bounds: { width: number; height: number };
  label: string;
  onCropChange: (patch: Pick<PetPartSource, "offsetX" | "offsetY">) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!source.file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(source.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [source.file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = source.color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!preview) return;
    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      const placement = calculateImagePlacement(image.naturalWidth, image.naturalHeight, {
        x: 0,
        y: 0,
        width: bounds.width,
        height: bounds.height,
      }, source);
      context.drawImage(image, placement.x, placement.y, placement.width, placement.height);
    };
    image.src = preview;
    return () => { image.onload = null; };
  }, [bounds.height, bounds.width, preview, source.color, source.offsetX, source.offsetY, source.zoom]);

  function beginDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!source.file) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, offsetX: source.offsetX, offsetY: source.offsetY };
  }

  function continueDrag(event: ReactPointerEvent<HTMLCanvasElement>) {
    const start = dragRef.current;
    if (!start) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onCropChange({
      offsetX: clampCropOffset(start.offsetX + (event.clientX - start.x) * 2 / Math.max(1, rect.width)),
      offsetY: clampCropOffset(start.offsetY + (event.clientY - start.y) * 2 / Math.max(1, rect.height)),
    });
  }

  return (
    <div className={`part-preview shape-${shape} ${mirrored ? "mirrored" : ""} ${source.file ? "draggable" : ""}`}>
      <canvas
        ref={canvasRef}
        aria-label={`${label}裁切预览${source.file ? "，可拖动图片" : ""}`}
        onPointerDown={beginDrag}
        onPointerMove={continueDrag}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}
      />
    </div>
  );
}

function clampCropOffset(value: number) {
  return Math.min(1, Math.max(-1, value));
}
