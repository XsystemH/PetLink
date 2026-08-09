---
name: create-petlink-pet
description: Create, edit, and validate personalized transparent source images for PetLink's lightweight layered desktop-pet generator. Use when a user asks to make a PetLink pet from a reference image or description, adapt a character for PetLink, improve a source image that failed PetLink generation, or inspect whether an image satisfies the PetLink 3-bone/4-action input contract.
---

# Create a PetLink pet

Produce one clean transparent PNG that PetLink can split into `head` and `body`. Do not produce sprite sheets, animation frames, source code, or a complex rig unless the user explicitly asks for developer artifacts.

## Workflow

1. Read [references/source-image-rules.md](references/source-image-rules.md).
2. Preserve the user's character identity, requested clothing, palette, expression, and art style.
3. Convert unsuitable compositions into a full-body neutral pose with a readable silhouette.
4. Generate or edit the image with the available image-generation tool.
5. Save the result as a transparent PNG.
6. Run `python scripts/validate_source.py <image.png>`.
7. Inspect the image visually after validation. Numeric validation cannot detect a misplaced anatomical split or unwanted merged limbs.
8. Iterate until validation passes and the image visibly follows the rules.
9. Deliver the PNG and briefly state whether PetLink will use the standard three-bone rig or may need the optional limb layers.

## Prompt construction

Include these constraints in the generation/edit prompt:

- one character only;
- complete body, uncropped;
- transparent background with no floor, shadow, text, border, or scenery;
- centered character with 8–12% clear margin;
- front or slight three-quarter view;
- neutral standing or floating pose;
- head visually separable from the body near 40% of the opaque character height;
- arms, legs, ears, wings, or tail readable and not fused into an ambiguous silhouette;
- consistent lighting and intact costume details;
- no extra limbs or duplicated accessories.

Adapt locomotion cues to the character. Keep legs separated for walkers, a clear lower mass for hoppers, and a clean lower silhouette for floating characters.

## Repairing failed inputs

When PetLink reports that it cannot split the image:

- remove complex or nontransparent backgrounds;
- restore missing feet, tail, ears, or lower body;
- move props away from the neck split;
- reduce extreme poses and foreshortening;
- enlarge a small character without touching the canvas edge;
- separate a head that visually merges into the torso.

Do not merely erase a rectangular band at the split. Preserve a natural neck or attachment boundary.

## Developer validation

When validating an internal `PetPackage` JSON, read [references/pet-package-v1.md](references/pet-package-v1.md) and run:

```text
python scripts/validate_petpack.py path/to/pet.json
```

Do not introduce additional required animations or more than seven bones in format version 1.
