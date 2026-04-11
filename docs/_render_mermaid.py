#!/usr/bin/env python3
"""Extract Mermaid code blocks from markdown and render them to PNG via kroki.io.

- Input: docs/CowTalk_v5_계획서_보강자료_33-34-35.md
- Output: docs/images/diagram-{N}.png + modified markdown with image refs
"""
import base64
import re
import sys
import urllib.request
import zlib
from pathlib import Path


DOCS = Path(__file__).parent
MD_FILE = DOCS / "CowTalk_v5_계획서_보강자료_33-34-35.md"
IMAGES_DIR = DOCS / "images"
KROKI_URL = "https://kroki.io/mermaid/png"

# Figure titles for alt text
FIGURE_TITLES = [
    "전체 시스템 구성도",
    "4-Layer AI Pipeline 데이터 흐름",
    "기술 스택 계층도",
    "배포 인프라 구성도",
    "Gateway 실행 흐름",
]


def kroki_encode(text: str) -> str:
    """Encode mermaid source to kroki URL-safe base64 (zlib deflate)."""
    compressed = zlib.compress(text.encode("utf-8"), 9)
    return base64.urlsafe_b64encode(compressed).decode("ascii")


def fetch_png(mermaid_source: str) -> bytes:
    """Fetch PNG bytes from kroki.io for given mermaid source."""
    encoded = kroki_encode(mermaid_source)
    url = f"{KROKI_URL}/{encoded}"
    req = urllib.request.Request(url, headers={"User-Agent": "cowtalk-doc-gen/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def main() -> int:
    if not MD_FILE.exists():
        print(f"ERROR: {MD_FILE} not found", file=sys.stderr)
        return 1

    IMAGES_DIR.mkdir(exist_ok=True)
    original = MD_FILE.read_text(encoding="utf-8")

    # Match ```mermaid ... ``` blocks
    pattern = re.compile(r"```mermaid\n(.*?)\n```", re.DOTALL)
    matches = list(pattern.finditer(original))

    if not matches:
        print("No mermaid blocks found.", file=sys.stderr)
        return 0

    print(f"Found {len(matches)} mermaid blocks.")

    # Render each block and collect replacements
    replacements = []
    for idx, match in enumerate(matches, start=1):
        mermaid_src = match.group(1)
        title = FIGURE_TITLES[idx - 1] if idx - 1 < len(FIGURE_TITLES) else f"Diagram {idx}"
        print(f"  [{idx}/{len(matches)}] Rendering: {title}")

        try:
            png_bytes = fetch_png(mermaid_src)
        except Exception as e:
            print(f"    ERROR: {e}", file=sys.stderr)
            return 2

        out_file = IMAGES_DIR / f"diagram-{idx:02d}.png"
        out_file.write_bytes(png_bytes)
        print(f"    Saved: {out_file.name} ({len(png_bytes):,} bytes)")

        # Build image reference (relative path for pandoc)
        img_ref = f"![{title}](images/diagram-{idx:02d}.png)"
        replacements.append((match.start(), match.end(), img_ref))

    # Apply replacements in reverse order to preserve offsets
    modified = original
    for start, end, new_text in reversed(replacements):
        modified = modified[:start] + new_text + modified[end:]

    MD_FILE.write_text(modified, encoding="utf-8")
    print(f"\nSUCCESS: Updated {MD_FILE.name} with {len(matches)} image references.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
