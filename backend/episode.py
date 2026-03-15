"""
EpisodeStore — manages per-episode in-memory improvement state and
handles saving edits back to parquet files atomically.

Key design decisions:
  - Improvement arrays are loaded lazily on first access per episode.
  - If the parquet file has no 'improvement' column, all frames default to 1.
  - Saves use atomic write (temp file + os.replace) with .bak backup on first write.
  - Only the improvement column is modified; all other data is preserved exactly.
  - Image columns are cached in memory after first read so that frame serving
    during playback is sub-millisecond instead of re-reading parquet each time.
"""

from __future__ import annotations

import os
import shutil
import tempfile
import threading
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from .dataset import DatasetInfo


@dataclass
class EpisodeState:
    improvement: list[int]
    original_improvement: list[int]
    is_human_input: list[int]
    dirty: bool = False


class _FrameCache:
    """LRU cache for decoded image column data.

    Caches the pyarrow ChunkedArray for a (episode_id, camera) pair so
    that sequential frame reads during playback are sub-millisecond.
    Evicts least-recently-used entries when the slot limit is reached.
    Max 5 slots ≈ 5 × ~25MB = ~125MB worst-case.
    """

    def __init__(self, max_slots: int = 5) -> None:
        self._cache: OrderedDict[tuple[int, str], pa.ChunkedArray] = OrderedDict()
        self._max = max_slots
        self._lock = threading.Lock()

    def get(self, episode_id: int, camera: str) -> pa.ChunkedArray | None:
        key = (episode_id, camera)
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return self._cache[key]
        return None

    def put(self, episode_id: int, camera: str, column: pa.ChunkedArray) -> None:
        key = (episode_id, camera)
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            else:
                if len(self._cache) >= self._max:
                    self._cache.popitem(last=False)
                self._cache[key] = column

    def invalidate_episode(self, episode_id: int) -> None:
        with self._lock:
            keys = [k for k in self._cache if k[0] == episode_id]
            for k in keys:
                del self._cache[k]

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()


class EpisodeStore:
    def __init__(self) -> None:
        self._states: dict[int, EpisodeState] = {}
        self._dataset_info: DatasetInfo | None = None
        self._backed_up: set[str] = set()
        self._frame_cache = _FrameCache(max_slots=5)

    def bind(self, info: DatasetInfo) -> None:
        self._dataset_info = info
        self._states.clear()
        self._backed_up.clear()
        self._frame_cache.clear()

    def _ensure_loaded(self, episode_id: int) -> EpisodeState:
        if episode_id in self._states:
            return self._states[episode_id]

        info = self._dataset_info
        if info is None:
            raise RuntimeError("No dataset loaded")

        meta = info.episodes.get(episode_id)
        if meta is None:
            raise KeyError(f"Episode {episode_id} not found")

        pf = pq.ParquetFile(meta.parquet_path)
        schema = pf.schema_arrow
        col_names = {f.name for f in schema}
        # Use actual parquet row count — metadata length can disagree
        actual_rows = pf.metadata.num_rows

        read_cols = []
        if "improvement" in col_names:
            read_cols.append("improvement")
        if "is_human_input" in col_names:
            read_cols.append("is_human_input")

        if read_cols:
            table = pf.read(columns=read_cols)

        if "improvement" in col_names:
            values = table.column("improvement").to_pylist()
            improvement = [int(v) if v is not None else 0 for v in values]
        else:
            improvement = [1] * actual_rows

        if "is_human_input" in col_names:
            hi_values = table.column("is_human_input").to_pylist()
            is_human_input = [int(v) if v is not None else 0 for v in hi_values]
        else:
            is_human_input = [0] * actual_rows

        # Keep num_frames in sync with reality
        if meta.num_frames != actual_rows:
            meta.num_frames = actual_rows

        state = EpisodeState(
            improvement=list(improvement),
            original_improvement=list(improvement),
            is_human_input=is_human_input,
            dirty=False,
        )
        self._states[episode_id] = state
        return state

    def get_improvement(self, episode_id: int) -> list[int]:
        return list(self._ensure_loaded(episode_id).improvement)

    def get_is_human_input(self, episode_id: int) -> list[int]:
        return list(self._ensure_loaded(episode_id).is_human_input)

    def is_dirty(self, episode_id: int) -> bool:
        if episode_id not in self._states:
            return False
        return self._states[episode_id].dirty

    def update_interval(self, episode_id: int, start: int, end: int, value: int) -> list[int]:
        state = self._ensure_loaded(episode_id)
        end_clamped = min(end, len(state.improvement) - 1)
        start_clamped = max(start, 0)
        for i in range(start_clamped, end_clamped + 1):
            state.improvement[i] = value
        state.dirty = state.improvement != state.original_improvement
        return list(state.improvement)

    def copy_from_human_input(self, episode_id: int) -> list[int]:
        state = self._ensure_loaded(episode_id)
        state.improvement = list(state.is_human_input)
        state.dirty = state.improvement != state.original_improvement
        return list(state.improvement)

    def set_all(self, episode_id: int, value: int) -> list[int]:
        state = self._ensure_loaded(episode_id)
        state.improvement = [value] * len(state.improvement)
        state.dirty = state.improvement != state.original_improvement
        return list(state.improvement)

    def reset(self, episode_id: int) -> list[int]:
        state = self._ensure_loaded(episode_id)
        state.improvement = list(state.original_improvement)
        state.dirty = False
        return list(state.improvement)

    def save(self, episode_id: int) -> None:
        """Persist improvement values to parquet with atomic write + backup."""
        info = self._dataset_info
        if info is None:
            raise RuntimeError("No dataset loaded")

        state = self._ensure_loaded(episode_id)
        meta = info.episodes[episode_id]
        parquet_path = meta.parquet_path

        # Backup original file before first save
        if parquet_path not in self._backed_up:
            bak_path = parquet_path + ".bak"
            if not Path(bak_path).exists():
                shutil.copy2(parquet_path, bak_path)
            self._backed_up.add(parquet_path)

        table = pq.read_table(parquet_path)

        improvement_array = pa.array(state.improvement, type=pa.int64())

        if "improvement" in table.column_names:
            col_idx = table.column_names.index("improvement")
            table = table.set_column(col_idx, "improvement", improvement_array)
        else:
            table = table.append_column("improvement", improvement_array)

        # Atomic write: write to temp file in same directory, then replace
        dir_path = os.path.dirname(parquet_path)
        fd, tmp_path = tempfile.mkstemp(suffix=".parquet", dir=dir_path)
        os.close(fd)
        try:
            pq.write_table(table, tmp_path)
            os.replace(tmp_path, parquet_path)
        except Exception:
            # Clean up temp file on failure
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            raise

        # After successful save, update original_improvement so the file
        # and in-memory state are in sync.
        state.original_improvement = list(state.improvement)
        state.dirty = False
        # Invalidate cached image columns since the parquet file changed
        self._frame_cache.invalidate_episode(episode_id)

    def get_frame_image(self, episode_id: int, frame_idx: int, camera: str = "image") -> bytes:
        """Return PNG bytes for a single frame.

        v2.1 datasets: reads the PNG file directly from
        ``images/chunk-NNN/{camera}/episode_NNNNNN/frame_NNNNNN.png``.

        Legacy datasets: reads the image column from parquet using an LRU
        cache so sequential playback stays sub-millisecond.
        """
        info = self._dataset_info
        if info is None:
            raise RuntimeError("No dataset loaded")

        meta = info.episodes.get(episode_id)
        if meta is None:
            raise KeyError(f"Episode {episode_id} not found")

        if camera not in meta.image_columns:
            available = meta.image_columns
            raise ValueError(f"Camera '{camera}' not found. Available: {available}")

        if frame_idx < 0 or frame_idx >= meta.num_frames:
            raise IndexError(f"Frame {frame_idx} out of range [0, {meta.num_frames})")

        # v2.1+: file-based images
        if info.image_path_template:
            episode_chunk = episode_id // info.chunks_size
            rel_path = info.image_path_template.format(
                episode_chunk=episode_chunk,
                image_key=camera,
                episode_index=episode_id,
                frame_index=frame_idx,
            )
            abs_path = Path(info.dataset_dir) / rel_path
            if not abs_path.exists():
                raise FileNotFoundError(f"Image file not found: {abs_path}")
            return abs_path.read_bytes()

        # Legacy: images embedded in parquet columns
        from .image_utils import decode_image

        column = self._frame_cache.get(episode_id, camera)
        if column is None:
            pf = pq.ParquetFile(meta.parquet_path)
            table = pf.read(columns=[camera])
            column = table.column(camera)
            self._frame_cache.put(episode_id, camera, column)

        row = column[frame_idx].as_py()
        return decode_image(row, info.dataset_dir)
