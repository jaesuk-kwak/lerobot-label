# LeRobot Trajectory Editor

A local web app for reviewing and editing LeRobot trajectories stored in parquet files. Browse episodes, replay frames as video, edit per-frame improvement flags, and save changes back to parquet.

## Prerequisites

- **Python 3.10+** and `pip`
- **Node.js 20+** and **npm** — install via [NodeSource](https://deb.nodesource.com/):
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```

## Quick Start

### 1. Backend (Python / FastAPI)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8100 --app-dir .. --factory 2>/dev/null || \
  python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8100
```

Or from the project root:

```bash
pip install -r backend/requirements.txt
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8100
```

The API will be available at `http://localhost:8100`.

### 2. Frontend (React / Vite)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. The Vite dev server proxies API requests to the backend on port 8100.

## Usage

1. Enter the dataset directory path in the top bar (e.g. `~/.cache/huggingface/lerobot/bimanual_multi_frames_images`).
2. Click **Load Dataset** to scan parquet files and build the episode index.
3. Select an episode from the left sidebar.
4. Use playback controls to review frames. Switch cameras with the dropdown.
5. Shift+drag on the timeline to select a frame range, then use the editor to set improvement values.
6. Click **Save** to persist changes to the parquet file on disk.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| Left Arrow | Previous frame |
| Right Arrow | Next frame |
| `[` | Previous episode |
| `]` | Next episode |

## Architecture

- **Backend**: FastAPI server that reads/writes parquet files with pyarrow. Serves frame images on demand and tracks improvement edits in memory until explicitly saved.
- **Frontend**: React + TypeScript + Vite. Communicates with backend via REST API. All state management is in React hooks.

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/dataset/load` | POST | Load a dataset directory |
| `/episodes` | GET | List all episodes |
| `/episode/{id}` | GET | Get episode detail with improvement array |
| `/episode/{id}/frame/{idx}` | GET | Get frame image (PNG) |
| `/episode/{id}/improvement` | POST | Edit improvement flags (interval or set-all) |
| `/episode/{id}/save` | POST | Save improvement to parquet |
| `/episode/{id}/reset` | POST | Discard unsaved changes |

## Data Handling Notes

- If `improvement` column is missing from the parquet data, all frames are initialized to `1`.
- If `success` column is missing, it is derived from `max(reward) >= 12.0` per episode.
- A `.bak` backup of each parquet file is created before the first save.
- Saves are atomic: data is written to a temp file then moved into place.
