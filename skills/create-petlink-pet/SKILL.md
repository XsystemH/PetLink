---
name: create-petlink-pet
description: Create, edit, and validate separate transparent part images for PetLink's fixed nine-bone desktop-pet rig. Use when a user asks to make a PetLink pet from a description or reference, prepare head/body/limb/ear uploads, repair a part that crops poorly, choose a coherent solid-color set, or validate a PetLink PetPackage v1.
---

# Create a PetLink pet

Produce a coherent part set for PetLink's fixed rig. Do not make animation frames, sprite sheets, code, or a free-form skeleton.

## Workflow

1. Read [references/source-image-rules.md](references/source-image-rules.md).
2. Confirm the character identity, palette, expression, clothing, and whether ears are needed from the request or references.
3. Create six required square PNGs named `head`, `body`, `arm-left`, `arm-right`, `leg-left`, and `leg-right`. Create `ear-left` and `ear-right` only when the design needs ears.
4. Keep one isolated part in each file. Preserve consistent scale, lighting, outline width, texture density, and left/right orientation across the set.
5. Use the available image-generation or editing tool. Keep backgrounds transparent and important details centered because PetLink center-fills each upload into a fixed mask.
6. Run `python scripts/validate_source.py <image.png> --part <part-id>` for every output.
7. Inspect every PNG visually after validation, then inspect the complete set together for seams, mismatched colors, mirrored text, duplicated details, or inconsistent perspective.
8. Iterate until the required six images pass and the optional ears, when present, also pass.
9. Deliver the files with their exact PetLink part names and tell the user which upload card receives each file.

If the user prefers pure colors, deliver a mapping from the same part IDs to six-digit hex colors instead of images. Keep paired limbs and ears symmetrical unless asymmetry is intentional.

## Prompt constraints

Include these constraints when generating or editing part images:

- exactly one isolated anatomical or costume part per image;
- square transparent PNG, at least 512 x 512;
- front-facing or slight three-quarter design consistent across every part;
- defining details centered and large enough to survive center-cover cropping;
- no scenery, floor, shadow, typography, watermark, UI, or neighboring body parts;
- no extra limbs or duplicated accessories;
- preserve deliberate left/right asymmetry without adding readable text that would break when the pet faces left.

## Repairing failed parts

- Move clipped eyes, markings, or costume details toward the center.
- Enlarge a small part while retaining a small transparent safety margin.
- Remove attached neighboring anatomy; PetLink supplies the final overlap and joint placement.
- Match hue, lighting, outline, and texture scale to the other files.
- Regenerate an incorrect side instead of mirroring directional symbols or asymmetric accessories.

## Developer validation

When validating an internal `PetPackage` JSON, read [references/pet-package-v1.md](references/pet-package-v1.md) and run:

```text
python scripts/validate_petpack.py path/to/pet.json
```

The standard generator keeps nine bones even when the two optional ear slots are disabled.
