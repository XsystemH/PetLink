# PetPackage v1

PetLink stores a package as JSON with embedded image data URLs. The protocol accepts 3–10 bones and 2–10 slots for backward compatibility; the current standard generator emits a fixed nine-bone rig.

## Standard rig

```text
root
└─ body
   ├─ head
   │  ├─ ear-left
   │  └─ ear-right
   ├─ arm-left
   ├─ arm-right
   ├─ leg-left
   └─ leg-right
```

Required slots are `head`, `body`, `arm-left`, `arm-right`, `leg-left`, and `leg-right`. Ear slots are an optional pair, but both ear bones remain in the package.

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
  "sourceName": "part sources"
}
```

## Limits

- Canvas: 64–1024 px per dimension; the standard generator uses 512 x 512.
- Required animations: exactly `idle`, `move`, `interact`, and `sleep`.
- Animation duration: 100–5000 ms; each track has 1–30 keyframes.
- Translation: normalized -1 to 1; rotation: -180 to 180 degrees; scale: 0.25 to 2.
- Package size: no more than 20 MB in the desktop client.
- Each slot contains an embedded `data:image/...` URL and references an existing bone.

Do not include scripts, executable content, remote URLs, arbitrary HTML, or extra required actions. Dragging and room transitions remain engine behavior.
