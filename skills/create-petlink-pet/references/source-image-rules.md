# PetLink part-image rules

## Asset set

PetLink uses one fixed rig. Prepare these files:

| Part ID | Required | Final mask |
| --- | --- | --- |
| `head` | yes | circle/ellipse |
| `body` | yes | vertical capsule |
| `arm-left`, `arm-right` | yes | narrow vertical capsules |
| `leg-left`, `leg-right` | yes | short vertical capsules |
| `ear-left`, `ear-right` | optional pair | curved triangles |

The app center-fills each upload into its mask. It does not infer anatomy or remove backgrounds.

## File contract

- PNG with alpha, square, at least 512 x 512.
- Exactly one isolated part per file.
- Keep visible content centered with roughly 2–8% transparent margin.
- Make the part fill most of the canvas; avoid a small full character surrounded by empty space.
- Do not include shadows, scenery, typography, UI, checkerboards, other body parts, or crop guides.
- Use consistent palette, lighting direction, outline width, resolution, and texture scale across all files.

## Composition by part

- `head`: include the complete face and hair/headwear that should rotate with it. Keep eyes and mouth away from the outer 15%.
- `body`: include torso clothing and central markings. Do not include the head, hands, or feet.
- arms and legs: isolate the corresponding side. Keep the joint end near the top and the extremity near the bottom.
- ears: isolate one ear per file with the attachment edge near the bottom. Omit both files for an earless design.

Paired parts may share an asset when they are truly symmetric. Generate both separately when markings, sleeves, footwear, lighting, or accessories differ. Avoid readable text and directional logos because the desktop renderer mirrors the whole pet when it turns.

## Visual checklist

- Important features remain recognizable when the complete pet is about 220 px tall.
- No opaque pixels touch a canvas corner.
- No neighboring anatomy is fused into a part.
- Paired limbs have compatible lengths and joint widths.
- The face is centered and not clipped by the circular mask.
- The complete set reads as one character rather than unrelated textures.
