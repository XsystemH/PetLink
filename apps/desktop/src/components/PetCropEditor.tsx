import { useEffect, useRef } from "react";
import {
  FIXED_RIG,
  PET_CANVAS_SIZE,
  drawAlignedSource,
  type PetAlignment,
} from "../lib/generate-pet";

interface PetCropEditorProps {
  image: ImageBitmap;
  alignment: PetAlignment;
  onChange: (alignment: PetAlignment) => void;
}

export function PetCropEditor({ image, alignment, onChange }: PetCropEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; alignment: PetAlignment } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    drawAlignedSource(context, image, alignment);
    drawGuide(context);
  }, [image, alignment]);

  return (
    <div className="crop-editor">
      <canvas
        ref={canvasRef}
        width={PET_CANVAS_SIZE}
        height={PET_CANVAS_SIZE}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { x: event.clientX, y: event.clientY, alignment };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          const rect = event.currentTarget.getBoundingClientRect();
          onChange({
            ...drag.alignment,
            offsetX: clamp(drag.alignment.offsetX + (event.clientX - drag.x) / rect.width, -0.65, 0.65),
            offsetY: clamp(drag.alignment.offsetY + (event.clientY - drag.y) / rect.height, -0.65, 0.65),
          });
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        aria-label="拖动图片，让角色头部和身体对齐虚线框"
      />
      <div className="crop-hint">拖动图片对齐虚线骨架</div>
      <label className="zoom-control">
        <span>缩放</span>
        <input
          type="range"
          min="0.55"
          max="3"
          step="0.01"
          value={alignment.zoom}
          onChange={(event) => onChange({ ...alignment, zoom: Number(event.target.value) })}
        />
        <button type="button" onClick={() => onChange({ zoom: 1, offsetX: 0, offsetY: 0 })}>重置</button>
      </label>
    </div>
  );
}

function drawGuide(context: CanvasRenderingContext2D) {
  const size = PET_CANVAS_SIZE;
  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.96)";
  context.lineWidth = 4;
  context.setLineDash([13, 10]);
  context.shadowColor = "rgba(43, 30, 59, 0.7)";
  context.shadowBlur = 5;

  context.beginPath();
  context.ellipse(
    size * 0.5,
    size * FIXED_RIG.headCenterY,
    size * FIXED_RIG.headRadiusX,
    size * FIXED_RIG.headRadiusY,
    0,
    0,
    Math.PI * 2,
  );
  context.stroke();

  context.beginPath();
  context.roundRect(
    size * (0.5 - FIXED_RIG.bodyRadiusX),
    size * (FIXED_RIG.bodyCenterY - FIXED_RIG.bodyRadiusY),
    size * FIXED_RIG.bodyRadiusX * 2,
    size * FIXED_RIG.bodyRadiusY * 2,
    size * 0.12,
  );
  context.stroke();

  context.setLineDash([8, 9]);
  context.beginPath();
  context.moveTo(size * 0.37, size * FIXED_RIG.neckY);
  context.lineTo(size * 0.63, size * FIXED_RIG.neckY);
  context.stroke();
  context.restore();
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
