# PetPackage v1

PetLink stores a package as JSON with embedded image data URLs.

## Required fields

```json
{
  "formatVersion": 1,
  "petId": "pet-alice",
  "name": "Pet name",
  "canvas": { "width": 512, "height": 512 },
  "bones": [],
  "slots": [],
  "animations": {},
  "createdAt": 0,
  "sourceName": "source.png"
}
```

## Limits

- Bones: 3–7.
- Required bones: `root`, `body`, `head`.
- Slots: 2–7; each slot contains a `data:image/...` URL.
- Canvas: 64–1024 px per dimension.
- Required animations: `idle`, `move`, `interact`, `sleep`.
- Animation duration: 100–5000 ms.
- Track keyframes: 1–30.
- Translation: normalized range -1 to 1.
- Rotation: -180 to 180 degrees.
- Scale: 0.25 to 2.
- Package size: no more than 20 MB in the desktop client.

Every bone contains `id`, nullable `parent`, `pivotX`, and `pivotY`. Each pivot is normalized from 0 to 1. Every slot contains `id`, `bone`, `dataUrl`, and `zIndex`.

Do not include scripts, executable content, remote URLs, arbitrary HTML, or extra animation names as required behavior. The renderer treats drag and room transitions as procedural engine effects.
