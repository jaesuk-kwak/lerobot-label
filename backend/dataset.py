"""
DatasetManager — scans a LeRobot dataset directory, detects schema, and
builds an episode index without loading heavy image data into memory.

Schema detection strategy:
  - Image columns: struct<bytes: binary, path: string> OR names matching *image*
  - Episode column: 'episode_index' > 'episode_id' > first int-like column with repeats
  - Frame column: 'frame_index' > 'frame_id' > row order
  - success: column if present, else derived from max(reward) >= 12.0 per episode
  - improvement: column if present, else synthesized as all-1s per episode
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class EpisodeMeta:
    episode_id: int
    parquet_path: str
    num_frames: int
    success: bool
    max_reward: float
    image_columns: list[str]


@dataclass
class DatasetInfo:
    dataset_dir: str
    fps: int = 20
    total_episodes: int = 0
    total_frames: int = 0
    task: str = ""
    episodes: dict[int, EpisodeMeta] = field(default_factory=dict)
    image_columns: list[str] = field(default_factory=list)
    has_improvement_col: bool = False
    has_is_human_input_col: bool = False
    has_success_col: bool = False


# ---------------------------------------------------------------------------
# Schema helpers
# ---------------------------------------------------------------------------

_IMAGE_NAME_HINTS = {"image", "observation.image", "left_wrist_image", "right_wrist_image"}


def _is_image_struct(field: pa.Field) -> bool:
    """HuggingFace Image columns are struct<bytes: binary, path: string>."""
    if not pa.types.is_struct(field.type):
        return False
    names = {f.name for f in field.type}
    return "bytes" in names and "path" in names


def _detect_image_columns(schema: pa.Schema) -> list[str]:
    found = []
    for f in schema:
        if _is_image_struct(f):
            found.append(f.name)
        elif any(hint in f.name.lower() for hint in ("image", "img", "observation.image")):
            if pa.types.is_binary(f.type) or pa.types.is_large_binary(f.type):
                found.append(f.name)
    return found


def _detect_column(schema: pa.Schema, preferred: list[str]) -> str | None:
    names = {f.name for f in schema}
    for p in preferred:
        if p in names:
            return p
    return None


# ---------------------------------------------------------------------------
# DatasetManager
# ---------------------------------------------------------------------------

class DatasetManager:
    def __init__(self) -> None:
        self.info: DatasetInfo | None = None

    def load(self, dataset_dir: str) -> DatasetInfo:
        root = Path(dataset_dir).expanduser().resolve()
        if not root.is_dir():
            raise FileNotFoundError(f"Dataset directory not found: {root}")

        parquet_files = sorted(root.rglob("*.parquet"))
        if not parquet_files:
            raise FileNotFoundError(f"No parquet files found under {root}")

        # Try to read metadata files (LeRobot v2 layout)
        fps, task_str, meta_episodes = _read_meta(root)

        info = DatasetInfo(dataset_dir=str(root), fps=fps, task=task_str)

        first_schema: pa.Schema | None = None

        for pf_path in parquet_files:
            pf = pq.ParquetFile(str(pf_path))
            schema = pf.schema_arrow

            if first_schema is None:
                first_schema = schema
                info.image_columns = _detect_image_columns(schema)
                info.has_improvement_col = "improvement" in {f.name for f in schema}
                info.has_is_human_input_col = "is_human_input" in {f.name for f in schema}
                info.has_success_col = "success" in {f.name for f in schema}

            ep_col = _detect_column(schema, ["episode_index", "episode_id"])
            frame_col = _detect_column(schema, ["frame_index", "frame_id"])

            # Read only lightweight columns for metadata scan
            read_cols = []
            if ep_col:
                read_cols.append(ep_col)
            if frame_col:
                read_cols.append(frame_col)
            read_cols.append("reward") if "reward" in {f.name for f in schema} else None
            if info.has_success_col:
                read_cols.append("success")

            # Deduplicate while preserving order
            read_cols = list(dict.fromkeys(c for c in read_cols if c))

            table = pf.read(columns=read_cols if read_cols else None)

            if ep_col:
                ep_ids = table.column(ep_col).to_pylist()
                unique_eps = sorted(set(ep_ids))
            else:
                unique_eps = [0]
                ep_ids = [0] * table.num_rows

            # num_rows is the authoritative row count from the parquet file.
            # meta/episodes.jsonl may report a different "length" (e.g. only
            # task-relevant frames), but the improvement column must match the
            # actual parquet row count, so we always use table.num_rows.
            for eid in unique_eps:
                if ep_col:
                    mask = [e == eid for e in ep_ids]
                    n_frames = sum(mask)
                else:
                    n_frames = table.num_rows

                if info.has_success_col:
                    success_vals = table.column("success").to_pylist()
                    if ep_col:
                        ep_success = [s for s, m in zip(success_vals, mask) if m]
                    else:
                        ep_success = success_vals
                    success = any(bool(v) for v in ep_success)
                elif "reward" in {f.name for f in schema}:
                    rewards = table.column("reward").to_pylist()
                    if ep_col:
                        ep_rewards = [r for r, m in zip(rewards, mask) if m]
                    else:
                        ep_rewards = rewards
                    max_r = max(ep_rewards) if ep_rewards else 0.0
                    success = max_r >= 12.0
                else:
                    success = False
                    max_r = 0.0

                max_reward = 0.0
                if "reward" in {f.name for f in schema}:
                    rewards = table.column("reward").to_pylist()
                    if ep_col:
                        ep_rewards = [r for r, m in zip(rewards, mask) if m]
                    else:
                        ep_rewards = rewards
                    max_reward = max(ep_rewards) if ep_rewards else 0.0

                meta_ep = EpisodeMeta(
                    episode_id=eid,
                    parquet_path=str(pf_path),
                    num_frames=n_frames,
                    success=success,
                    max_reward=max_reward,
                    image_columns=info.image_columns,
                )

                info.episodes[eid] = meta_ep
                info.total_frames += n_frames

        info.total_episodes = len(info.episodes)
        self.info = info
        return info


def _read_meta(root: Path) -> tuple[int, str, dict[int, int] | None]:
    """Read optional LeRobot meta/ directory."""
    fps = 20
    task_str = ""
    meta_episodes: dict[int, int] | None = None

    info_path = root / "meta" / "info.json"
    if info_path.exists():
        with open(info_path) as f:
            meta = json.load(f)
        fps = meta.get("fps", 20)

    tasks_path = root / "meta" / "tasks.jsonl"
    if tasks_path.exists():
        with open(tasks_path) as f:
            for line in f:
                obj = json.loads(line)
                task_str = obj.get("task", "")
                break

    episodes_path = root / "meta" / "episodes.jsonl"
    if episodes_path.exists():
        meta_episodes = {}
        with open(episodes_path) as f:
            for line in f:
                obj = json.loads(line)
                meta_episodes[obj["episode_index"]] = obj["length"]

    return fps, task_str, meta_episodes
