#!/usr/bin/env python3
"""Validate the structural limits of a PetLink PetPackage v1 JSON file."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REQUIRED_BONES = {
    "root",
    "body",
    "head",
    "ear-left",
    "ear-right",
    "arm-left",
    "arm-right",
    "leg-left",
    "leg-right",
}
REQUIRED_SLOTS = {"body", "head", "arm-left", "arm-right", "leg-left", "leg-right"}
OPTIONAL_SLOTS = {"ear-left", "ear-right"}
REQUIRED_ACTIONS = {"idle", "move", "interact", "sleep"}


def validate(data: dict) -> list[str]:
    issues: list[str] = []
    if data.get("formatVersion") != 1:
        issues.append("formatVersion must be 1")
    bones = data.get("bones") if isinstance(data.get("bones"), list) else []
    slots = data.get("slots") if isinstance(data.get("slots"), list) else []
    animations = data.get("animations") if isinstance(data.get("animations"), dict) else {}
    bone_ids = {bone.get("id") for bone in bones if isinstance(bone, dict)}
    if bone_ids != REQUIRED_BONES or len(bones) != len(REQUIRED_BONES):
        issues.append("standard rig must contain exactly the nine PetLink bones")
    if not 6 <= len(slots) <= 8:
        issues.append("standard rig must contain 6-8 slots")
    slot_ids = {slot.get("id") for slot in slots if isinstance(slot, dict)}
    if not REQUIRED_SLOTS.issubset(slot_ids):
        issues.append("head, body, both arms, and both legs require slots")
    if len(OPTIONAL_SLOTS.intersection(slot_ids)) == 1:
        issues.append("ear slots must be enabled or omitted as a pair")
    if slot_ids - REQUIRED_SLOTS - OPTIONAL_SLOTS:
        issues.append("standard rig contains an unknown slot")
    for slot in slots:
        if not isinstance(slot, dict) or not str(slot.get("dataUrl", "")).startswith("data:image/"):
            issues.append("every slot must contain an embedded image dataUrl")
        if isinstance(slot, dict) and slot.get("bone") not in bone_ids:
            issues.append(f"slot references missing bone: {slot.get('bone')}")
    if set(animations) != REQUIRED_ACTIONS:
        issues.append("animations must contain exactly idle, move, interact, and sleep")
    for name, animation in animations.items():
        if not isinstance(animation, dict):
            issues.append(f"animation {name} must be an object")
            continue
        duration = animation.get("durationMs")
        if not isinstance(duration, int) or not 100 <= duration <= 5000:
            issues.append(f"animation {name} durationMs must be 100-5000")
        tracks = animation.get("tracks")
        if not isinstance(tracks, dict):
            issues.append(f"animation {name} tracks must be an object")
            continue
        for bone_id, frames in tracks.items():
            if bone_id not in bone_ids:
                issues.append(f"animation {name} references missing bone {bone_id}")
            if not isinstance(frames, list) or not 1 <= len(frames) <= 30:
                issues.append(f"animation {name}/{bone_id} must have 1-30 keyframes")
    return issues


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("petpack", type=Path)
    args = parser.parse_args()
    try:
        data = json.loads(args.petpack.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(json.dumps({"ok": False, "issues": [str(error)]}, ensure_ascii=False, indent=2))
        return 1
    if isinstance(data, dict) and isinstance(data.get("pet"), dict):
        data = data["pet"]
    issues = validate(data)
    print(json.dumps({"ok": not issues, "issues": issues}, ensure_ascii=False, indent=2))
    return 0 if not issues else 1


if __name__ == "__main__":
    sys.exit(main())
