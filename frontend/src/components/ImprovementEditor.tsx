import { useState } from 'react';

interface Props {
  totalFrames: number;
  currentFrame: number;
  selectionStart: number | null;
  selectionEnd: number | null;
  onSelectionChange: (start: number | null, end: number | null) => void;
  onSetInterval: (start: number, end: number, value: number) => void;
  onSetAll: (value: number) => void;
  onCopyHumanInput: () => void;
  hasHumanInput: boolean;
  onSave: () => void;
  onReset: () => void;
  dirty: boolean;
  saving: boolean;
}

export default function ImprovementEditor({
  totalFrames,
  currentFrame,
  selectionStart,
  selectionEnd,
  onSelectionChange,
  onSetInterval,
  onSetAll,
  onCopyHumanInput,
  hasHumanInput,
  onSave,
  onReset,
  dirty,
  saving,
}: Props) {
  const [confirmSave, setConfirmSave] = useState(false);

  const hasSelection = selectionStart !== null && selectionEnd !== null;
  const sStart = hasSelection ? Math.min(selectionStart!, selectionEnd!) : 0;
  const sEnd = hasSelection ? Math.max(selectionStart!, selectionEnd!) : 0;

  const handleSave = () => {
    if (!confirmSave) {
      setConfirmSave(true);
      return;
    }
    setConfirmSave(false);
    onSave();
  };

  return (
    <div className="improvement-editor">
      <h3>Edit Improvement</h3>

      <div className="interval-controls">
        <label>
          Start
          <input
            type="number"
            min={0}
            max={totalFrames - 1}
            value={selectionStart ?? ''}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (!isNaN(v)) onSelectionChange(v, selectionEnd ?? v);
            }}
          />
        </label>
        <label>
          End
          <input
            type="number"
            min={0}
            max={totalFrames - 1}
            value={selectionEnd ?? ''}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (!isNaN(v)) onSelectionChange(selectionStart ?? v, v);
            }}
          />
        </label>
      </div>

      <div className="mark-buttons">
        <button
          onClick={() => onSelectionChange(currentFrame, selectionEnd ?? currentFrame)}
          className="btn-mark"
          title="Set selection start to current playback frame"
        >
          Mark Start ({currentFrame})
        </button>
        <button
          onClick={() => onSelectionChange(selectionStart ?? currentFrame, currentFrame)}
          className="btn-mark"
          title="Set selection end to current playback frame"
        >
          Mark End ({currentFrame})
        </button>
      </div>

      <div className="interval-buttons">
        <button
          disabled={!hasSelection}
          onClick={() => onSetInterval(sStart, sEnd, 1)}
          className="btn-set-one"
        >
          Set Range &rarr; 1
        </button>
        <button
          disabled={!hasSelection}
          onClick={() => onSetInterval(sStart, sEnd, 0)}
          className="btn-set-zero"
        >
          Set Range &rarr; 0
        </button>
        <button onClick={() => onSelectionChange(null, null)} className="btn-clear-sel">
          Clear Selection
        </button>
      </div>

      <div className="bulk-buttons">
        <button onClick={() => onSetAll(1)} className="btn-set-one">
          Set ALL &rarr; 1
        </button>
        <button onClick={() => onSetAll(0)} className="btn-set-zero">
          Set ALL &rarr; 0
        </button>
        {hasHumanInput && (
          <button onClick={onCopyHumanInput} className="btn-copy-human">
            Copy from is_human_input
          </button>
        )}
      </div>

      <div className="save-controls">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className={`btn-save ${confirmSave ? 'confirm' : ''}`}
        >
          {saving ? 'Saving...' : confirmSave ? 'Confirm Save?' : 'Save'}
        </button>
        <button onClick={onReset} disabled={!dirty} className="btn-reset">
          Reset
        </button>
        {confirmSave && (
          <button onClick={() => setConfirmSave(false)} className="btn-cancel">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
