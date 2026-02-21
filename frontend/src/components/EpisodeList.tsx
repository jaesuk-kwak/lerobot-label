import { useState } from 'react';
import type { EpisodeSummary } from '../types';

interface Props {
  episodes: EpisodeSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  dirtySet: Set<number>;
}

export default function EpisodeList({ episodes, selectedId, onSelect, dirtySet }: Props) {
  const [filter, setFilter] = useState('');
  const [showOnlyDirty, setShowOnlyDirty] = useState(false);

  const filtered = episodes.filter((ep) => {
    if (showOnlyDirty && !dirtySet.has(ep.episode_id)) return false;
    if (filter) {
      const q = filter.toLowerCase();
      const idStr = String(ep.episode_id);
      return idStr.includes(q);
    }
    return true;
  });

  return (
    <div className="episode-list">
      <div className="episode-list-header">
        <input
          type="text"
          placeholder="Filter episodes..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="episode-filter"
        />
        <label className="dirty-toggle">
          <input
            type="checkbox"
            checked={showOnlyDirty}
            onChange={(e) => setShowOnlyDirty(e.target.checked)}
          />
          Unsaved only
        </label>
      </div>
      <div className="episode-items">
        {filtered.map((ep) => (
          <button
            key={ep.episode_id}
            className={`episode-item ${ep.episode_id === selectedId ? 'selected' : ''} ${
              dirtySet.has(ep.episode_id) ? 'dirty' : ''
            }`}
            onClick={() => onSelect(ep.episode_id)}
          >
            <span className="ep-id">Ep {ep.episode_id}</span>
            <span className="ep-meta">
              {ep.num_frames}f
              {ep.success ? ' ✓' : ''}
            </span>
            {dirtySet.has(ep.episode_id) && <span className="dirty-dot" title="Unsaved changes" />}
          </button>
        ))}
        {filtered.length === 0 && <div className="no-episodes">No episodes match</div>}
      </div>
    </div>
  );
}
