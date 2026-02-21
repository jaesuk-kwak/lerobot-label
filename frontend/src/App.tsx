import { useState, useCallback, useEffect } from 'react';
import DatasetLoader from './components/DatasetLoader';
import EpisodeList from './components/EpisodeList';
import FrameViewer from './components/FrameViewer';
import Timeline from './components/Timeline';
import MetadataPanel from './components/MetadataPanel';
import ImprovementEditor from './components/ImprovementEditor';
import { usePlayback } from './hooks/usePlayback';
import {
  loadDataset,
  getEpisode,
  updateImprovement,
  saveEpisode,
  resetEpisode,
} from './api';
import type { EpisodeSummary, EpisodeDetail } from './types';
import './App.css';

export default function App() {
  // Dataset state
  const [loading, setLoading] = useState(false);
  const [loadedDir, setLoadedDir] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
  const [fps, setFps] = useState(20);
  const [imageColumns, setImageColumns] = useState<string[]>(['image']);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Episode state
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [episode, setEpisode] = useState<EpisodeDetail | null>(null);
  const [camera, setCamera] = useState('image');
  const [dirtySet, setDirtySet] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  // Selection state
  const [selStart, setSelStart] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);

  // Playback
  const [playback, actions] = usePlayback(episode?.num_frames ?? 0, fps);

  // Toast messages
  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 5000);
  }, []);

  const showInfo = useCallback((msg: string) => {
    setInfoMsg(msg);
    setTimeout(() => setInfoMsg(null), 4000);
  }, []);

  // Load dataset
  const handleLoad = useCallback(
    async (dir: string) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await loadDataset(dir);
        setLoadedDir(res.dataset_dir);
        setEpisodes(res.episodes);
        setFps(res.fps);
        setImageColumns(res.image_columns);
        setSelectedId(null);
        setEpisode(null);
        setDirtySet(new Set());

        const msgs: string[] = [];
        if (!res.has_improvement_col) msgs.push('improvement column synthesized (all 1s)');
        if (!res.has_success_col) msgs.push('success derived from reward >= 12');
        if (msgs.length > 0) showInfo(msgs.join(' · '));
      } catch (e: any) {
        showError(e.message || 'Failed to load dataset');
      } finally {
        setLoading(false);
      }
    },
    [showError, showInfo],
  );

  // Select episode
  const handleSelectEpisode = useCallback(
    async (id: number) => {
      setSelectedId(id);
      setSelStart(null);
      setSelEnd(null);
      try {
        const ep = await getEpisode(id);
        setEpisode(ep);
        if (ep.dirty) setDirtySet((prev) => new Set(prev).add(id));
        actions.reset(ep.num_frames);
        if (ep.image_columns.length > 0 && !ep.image_columns.includes(camera)) {
          setCamera(ep.image_columns[0]);
        }
      } catch (e: any) {
        showError(e.message || 'Failed to load episode');
      }
    },
    [camera, actions, showError],
  );

  // Navigate episodes
  const navigateEpisode = useCallback(
    (delta: number) => {
      if (episodes.length === 0) return;
      const currentIdx = episodes.findIndex((e) => e.episode_id === selectedId);
      const nextIdx = Math.max(0, Math.min(episodes.length - 1, currentIdx + delta));
      handleSelectEpisode(episodes[nextIdx].episode_id);
    },
    [episodes, selectedId, handleSelectEpisode],
  );

  // Improvement editing
  const handleSetInterval = useCallback(
    async (start: number, end: number, value: number) => {
      if (!episode) return;
      try {
        const res = await updateImprovement(episode.episode_id, { start, end, value });
        setEpisode((prev) => (prev ? { ...prev, improvement: res.improvement, dirty: res.dirty } : prev));
        if (res.dirty) setDirtySet((prev) => new Set(prev).add(episode.episode_id));
        else setDirtySet((prev) => { const s = new Set(prev); s.delete(episode.episode_id); return s; });
      } catch (e: any) {
        showError(e.message);
      }
    },
    [episode, showError],
  );

  const handleSetAll = useCallback(
    async (value: number) => {
      if (!episode) return;
      try {
        const res = await updateImprovement(episode.episode_id, { set_all: value });
        setEpisode((prev) => (prev ? { ...prev, improvement: res.improvement, dirty: res.dirty } : prev));
        if (res.dirty) setDirtySet((prev) => new Set(prev).add(episode.episode_id));
        else setDirtySet((prev) => { const s = new Set(prev); s.delete(episode.episode_id); return s; });
      } catch (e: any) {
        showError(e.message);
      }
    },
    [episode, showError],
  );

  const handleSave = useCallback(async () => {
    if (!episode) return;
    setSaving(true);
    try {
      await saveEpisode(episode.episode_id);
      setEpisode((prev) => (prev ? { ...prev, dirty: false } : prev));
      setDirtySet((prev) => { const s = new Set(prev); s.delete(episode.episode_id); return s; });
      showInfo(`Episode ${episode.episode_id} saved.`);
    } catch (e: any) {
      showError(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [episode, showError, showInfo]);

  const handleReset = useCallback(async () => {
    if (!episode) return;
    try {
      const res = await resetEpisode(episode.episode_id);
      setEpisode((prev) => (prev ? { ...prev, improvement: res.improvement, dirty: false } : prev));
      setDirtySet((prev) => { const s = new Set(prev); s.delete(episode.episode_id); return s; });
      showInfo('Changes reset.');
    } catch (e: any) {
      showError(e.message);
    }
  }, [episode, showError, showInfo]);

  const handleSelectionChange = useCallback((s: number | null, e: number | null) => {
    setSelStart(s);
    setSelEnd(e);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          actions.togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          actions.prevFrame();
          break;
        case 'ArrowRight':
          e.preventDefault();
          actions.nextFrame();
          break;
        case '[':
          e.preventDefault();
          navigateEpisode(-1);
          break;
        case ']':
          e.preventDefault();
          navigateEpisode(1);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [actions, navigateEpisode]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>LeRobot Trajectory Editor</h1>
        <DatasetLoader onLoad={handleLoad} loading={loading} loadedDir={loadedDir} />
      </header>

      {(infoMsg || errorMsg) && (
        <div className={`toast ${errorMsg ? 'toast-error' : 'toast-info'}`}>
          {errorMsg || infoMsg}
        </div>
      )}

      {episodes.length > 0 && (
        <div className="app-body">
          <aside className="sidebar">
            <EpisodeList
              episodes={episodes}
              selectedId={selectedId}
              onSelect={handleSelectEpisode}
              dirtySet={dirtySet}
            />
          </aside>

          <main className="main-panel">
            {episode ? (
              <>
                <FrameViewer
                  episodeId={episode.episode_id}
                  camera={camera}
                  cameras={imageColumns}
                  onCameraChange={setCamera}
                  state={playback}
                  actions={actions}
                />
                <Timeline
                  totalFrames={episode.num_frames}
                  currentFrame={playback.currentFrame}
                  improvement={episode.improvement}
                  onSeek={actions.seekTo}
                  selectionStart={selStart}
                  selectionEnd={selEnd}
                  onSelectionChange={handleSelectionChange}
                />
              </>
            ) : (
              <div className="placeholder">Select an episode to begin</div>
            )}
          </main>

          <aside className="right-panel">
            {episode && (
              <>
                <MetadataPanel
                  episodeId={episode.episode_id}
                  numFrames={episode.num_frames}
                  success={episode.success}
                  maxReward={episode.max_reward}
                  improvement={episode.improvement}
                  dirty={episode.dirty}
                />
                <ImprovementEditor
                  totalFrames={episode.num_frames}
                  currentFrame={playback.currentFrame}
                  selectionStart={selStart}
                  selectionEnd={selEnd}
                  onSelectionChange={handleSelectionChange}
                  onSetInterval={handleSetInterval}
                  onSetAll={handleSetAll}
                  onSave={handleSave}
                  onReset={handleReset}
                  dirty={episode.dirty}
                  saving={saving}
                />
              </>
            )}
          </aside>
        </div>
      )}

      {!loading && episodes.length === 0 && loadedDir === null && (
        <div className="welcome">
          <p>Enter a dataset directory path above and click <strong>Load Dataset</strong> to begin.</p>
        </div>
      )}
    </div>
  );
}
