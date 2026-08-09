import { useEffect, useState } from "react";
import {
  PET_PARTS,
  type PetPartId,
  type PetPartSource,
  type PetPartSources,
} from "../lib/generate-pet";

interface PetPartsEditorProps {
  value: PetPartSources;
  onChange: (value: PetPartSources) => void;
}

export function PetPartsEditor({ value, onChange }: PetPartsEditorProps) {
  function update(partId: PetPartId, patch: Partial<PetPartSource>) {
    onChange({ ...value, [partId]: { ...value[partId], ...patch } });
  }

  return (
    <div className="parts-editor">
      <div className="parts-help">
        每个部件都可以单独选择照片，照片会从中心填满虚线形状；不上传时使用右侧纯色。
      </div>
      <div className="parts-grid">
        {PET_PARTS.map((part) => {
          const source = value[part.id];
          return (
            <article className={`part-card ${!source.enabled ? "disabled" : ""}`} key={part.id}>
              <PartPreview source={source} shape={part.shape} mirrored={part.id === "ear-right"} />
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
                      if (file) update(part.id, { file });
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <label className="part-color" title="选择纯色">
                  <input
                    type="color"
                    value={source.color}
                    disabled={!source.enabled}
                    onChange={(event) => update(part.id, { color: event.target.value, file: null })}
                  />
                </label>
                {source.file && <button type="button" onClick={() => update(part.id, { file: null })}>纯色</button>}
              </div>
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

function PartPreview({ source, shape, mirrored }: {
  source: PetPartSource;
  shape: "circle" | "capsule" | "ear";
  mirrored: boolean;
}) {
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

  return (
    <div
      className={`part-preview shape-${shape} ${mirrored ? "mirrored" : ""}`}
      style={{ backgroundColor: source.color }}
      aria-hidden="true"
    >
      {preview && <img src={preview} alt="" />}
    </div>
  );
}
