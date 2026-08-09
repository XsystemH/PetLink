# PetLink source-image rules

## Output contract

- Format: PNG with an alpha channel.
- Canvas: square, preferably 1024 × 1024; minimum 512 × 512.
- Character count: exactly one.
- Bounds: keep all opaque content inside a 6% safety margin; target 8–12%.
- Character height: occupy 70–88% of the canvas.
- Grounding: place the lowest visible point around 88–94% of canvas height.
- Split target: place the natural head/body attachment around 36–44% of the character's opaque height.
- Background: fully transparent; do not include shadows, glows reaching the edge, scenery, typography, UI, or a checkerboard pattern.

## Composition

Prefer a relaxed front-facing or slight three-quarter pose. Preserve a continuous body while keeping the neck boundary readable. Keep hands and held objects away from the head/body split. Avoid crossed limbs, seated poses, extreme perspective, motion blur, and cropped accessories.

PetLink's MVP generator creates a three-bone rig: `root`, `body`, and `head`. It may later add left/right arm and leg bones, but the source must remain usable with only the required three bones.

## Style freedom

Allow pixel art, flat illustration, painterly rendering, mascots, animals, monsters, people, floating objects, and abstract blobs. Preserve the requested style as long as transparency, silhouette, margins, and split position remain valid.

For characters without a literal head, treat the upper expressive region as `head` and the lower locomotion mass as `body`.

## Visual checklist

- No part touches the canvas edge.
- No unintended holes or semi-transparent background residue.
- Face and defining features remain recognizable at 220 px display size.
- Upper and lower regions both contain substantial visible content.
- Mirroring the character does not create incorrect text or asymmetric symbols that must stay directional.
- The image contains no copyrighted watermark or artist signature unless the user owns it and explicitly requests preservation.
