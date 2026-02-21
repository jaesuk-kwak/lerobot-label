"""
Utility for decoding images from various LeRobot parquet formats.

LeRobot datasets store images in parquet columns that may use different encodings:
  1. HuggingFace Image struct: {bytes: binary, path: string} — most common in v2+
  2. Raw binary (PNG/JPEG bytes stored directly)
  3. File path strings pointing to images on disk
  4. Serialized numpy arrays

This module provides a single `decode_image` function that handles all cases.
"""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image


def decode_image(value, dataset_dir: str | None = None) -> bytes:
    """Decode an image value from a parquet cell into PNG bytes.

    Handles HuggingFace struct {bytes, path}, raw binary, file paths,
    and numpy arrays. Returns PNG-encoded bytes ready for HTTP response.
    """
    # Case 1: HuggingFace Image struct — dict with 'bytes' key
    if isinstance(value, dict):
        if "bytes" in value and value["bytes"] is not None:
            raw = value["bytes"]
            if isinstance(raw, (bytes, bytearray)):
                return _ensure_png(raw)
            if isinstance(raw, memoryview):
                return _ensure_png(bytes(raw))
        if "path" in value and value["path"] is not None:
            return _read_image_file(value["path"], dataset_dir)
        raise ValueError(f"Image struct has no usable 'bytes' or 'path': keys={list(value.keys())}")

    # Case 2: raw bytes (PNG/JPEG already encoded)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return _ensure_png(bytes(value))

    # Case 3: file path string
    if isinstance(value, str):
        return _read_image_file(value, dataset_dir)

    # Case 4: numpy array
    try:
        import numpy as np

        if isinstance(value, np.ndarray):
            return _ndarray_to_png(value)
    except ImportError:
        pass

    raise ValueError(f"Unsupported image type: {type(value)}")


def _ensure_png(data: bytes) -> bytes:
    """If data is already PNG return as-is; if JPEG or other, re-encode to PNG."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return data
    # JPEG or other — re-encode
    img = Image.open(io.BytesIO(data))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _read_image_file(path_str: str, dataset_dir: str | None) -> bytes:
    p = Path(path_str)
    if not p.is_absolute() and dataset_dir:
        p = Path(dataset_dir) / p
    if not p.exists():
        raise FileNotFoundError(f"Image file not found: {p}")
    img = Image.open(p)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _ndarray_to_png(arr) -> bytes:
    import numpy as np

    if arr.dtype != np.uint8:
        arr = arr.astype(np.uint8)
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
