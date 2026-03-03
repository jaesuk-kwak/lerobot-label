"""
FastAPI backend for LeRobot Trajectory Editor.

Provides endpoints for loading datasets, browsing episodes, serving frame
images, editing improvement flags, and persisting changes to parquet.
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .dataset import DatasetManager
from .episode import EpisodeStore

app = FastAPI(title="LeRobot Trajectory Editor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

manager = DatasetManager()
store = EpisodeStore()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class LoadRequest(BaseModel):
    dataset_dir: str


class ImprovementUpdate(BaseModel):
    start: int | None = None
    end: int | None = None
    value: int | None = None
    set_all: int | None = None
    copy_human_input: bool = False


# ---------------------------------------------------------------------------
# Dataset endpoints
# ---------------------------------------------------------------------------

@app.post("/dataset/load")
def load_dataset(req: LoadRequest):
    try:
        info = manager.load(req.dataset_dir)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    store.bind(info)

    episodes_summary = []
    for eid in sorted(info.episodes.keys()):
        ep = info.episodes[eid]
        episodes_summary.append({
            "episode_id": ep.episode_id,
            "num_frames": ep.num_frames,
            "success": ep.success,
            "max_reward": ep.max_reward,
        })

    return {
        "dataset_dir": info.dataset_dir,
        "total_episodes": info.total_episodes,
        "total_frames": info.total_frames,
        "fps": info.fps,
        "task": info.task,
        "image_columns": info.image_columns,
        "has_improvement_col": info.has_improvement_col,
        "has_is_human_input_col": info.has_is_human_input_col,
        "has_success_col": info.has_success_col,
        "episodes": episodes_summary,
    }


@app.get("/episodes")
def list_episodes():
    info = manager.info
    if info is None:
        raise HTTPException(status_code=400, detail="No dataset loaded")

    result = []
    for eid in sorted(info.episodes.keys()):
        ep = info.episodes[eid]
        result.append({
            "episode_id": ep.episode_id,
            "num_frames": ep.num_frames,
            "success": ep.success,
            "max_reward": ep.max_reward,
            "dirty": store.is_dirty(eid),
        })
    return result


@app.get("/episode/{episode_id}")
def get_episode(episode_id: int):
    info = manager.info
    if info is None:
        raise HTTPException(status_code=400, detail="No dataset loaded")

    meta = info.episodes.get(episode_id)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} not found")

    try:
        improvement = store.get_improvement(episode_id)
        is_human_input = store.get_is_human_input(episode_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "episode_id": meta.episode_id,
        "num_frames": meta.num_frames,
        "success": meta.success,
        "max_reward": meta.max_reward,
        "image_columns": meta.image_columns,
        "improvement": improvement,
        "is_human_input": is_human_input,
        "dirty": store.is_dirty(episode_id),
    }


@app.get("/episode/{episode_id}/frame/{frame_idx}")
def get_frame(
    episode_id: int,
    frame_idx: int,
    camera: str = Query(default="image"),
):
    try:
        png_bytes = store.get_frame_image(episode_id, frame_idx, camera)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except (IndexError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image decode error: {e}")

    return Response(content=png_bytes, media_type="image/png")


# ---------------------------------------------------------------------------
# Improvement editing endpoints
# ---------------------------------------------------------------------------

@app.post("/episode/{episode_id}/improvement")
def update_improvement(episode_id: int, body: ImprovementUpdate):
    info = manager.info
    if info is None:
        raise HTTPException(status_code=400, detail="No dataset loaded")
    if episode_id not in info.episodes:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} not found")

    try:
        if body.copy_human_input:
            improvement = store.copy_from_human_input(episode_id)
        elif body.set_all is not None:
            improvement = store.set_all(episode_id, body.set_all)
        elif body.start is not None and body.end is not None and body.value is not None:
            improvement = store.update_interval(episode_id, body.start, body.end, body.value)
        else:
            raise HTTPException(
                status_code=400,
                detail="Provide either {copy_human_input}, {set_all}, or {start, end, value}",
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "improvement": improvement,
        "dirty": store.is_dirty(episode_id),
    }


@app.post("/episode/{episode_id}/save")
def save_episode(episode_id: int):
    info = manager.info
    if info is None:
        raise HTTPException(status_code=400, detail="No dataset loaded")
    if episode_id not in info.episodes:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} not found")

    try:
        store.save(episode_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Save failed: {e}")

    return {"status": "saved", "episode_id": episode_id}


@app.post("/episode/{episode_id}/reset")
def reset_episode(episode_id: int):
    info = manager.info
    if info is None:
        raise HTTPException(status_code=400, detail="No dataset loaded")
    if episode_id not in info.episodes:
        raise HTTPException(status_code=404, detail=f"Episode {episode_id} not found")

    try:
        improvement = store.reset(episode_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "improvement": improvement,
        "dirty": False,
    }
