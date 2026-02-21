import { useState } from 'react';

interface Props {
  onLoad: (datasetDir: string) => void;
  loading: boolean;
  loadedDir: string | null;
}

export default function DatasetLoader({ onLoad, loading, loadedDir }: Props) {
  const [dir, setDir] = useState(
    '~/.cache/huggingface/lerobot/bimanual_multi_frames_images'
  );

  return (
    <div className="dataset-loader">
      <input
        type="text"
        value={dir}
        onChange={(e) => setDir(e.target.value)}
        placeholder="Dataset directory path..."
        onKeyDown={(e) => e.key === 'Enter' && !loading && onLoad(dir)}
      />
      <button onClick={() => onLoad(dir)} disabled={loading}>
        {loading ? 'Loading...' : 'Load Dataset'}
      </button>
      {loadedDir && <span className="loaded-badge">Loaded: {loadedDir}</span>}
    </div>
  );
}
