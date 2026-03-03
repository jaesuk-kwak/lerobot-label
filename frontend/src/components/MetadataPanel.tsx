interface Props {
  episodeId: number;
  numFrames: number;
  success: boolean;
  maxReward: number;
  improvement: number[];
  isHumanInput: number[];
  dirty: boolean;
}

export default function MetadataPanel({
  episodeId,
  numFrames,
  success,
  maxReward,
  improvement,
  isHumanInput,
  dirty,
}: Props) {
  const onesCount = improvement.filter((v) => v === 1).length;
  const zerosCount = improvement.length - onesCount;
  const humanOnes = isHumanInput.filter((v) => v === 1).length;
  const humanZeros = isHumanInput.length - humanOnes;

  return (
    <div className="metadata-panel">
      <h3>Episode {episodeId}</h3>
      <table>
        <tbody>
          <tr>
            <td>Frames</td>
            <td>{numFrames}</td>
          </tr>
          <tr>
            <td>Success</td>
            <td className={success ? 'val-success' : 'val-fail'}>
              {success ? 'Yes' : 'No'}
            </td>
          </tr>
          <tr>
            <td>Max Reward</td>
            <td>{maxReward}</td>
          </tr>
          <tr>
            <td>Improvement</td>
            <td>
              <span className="imp-ones">{onesCount}</span> /
              <span className="imp-zeros"> {zerosCount}</span>
            </td>
          </tr>
          {isHumanInput.length > 0 && (
            <tr>
              <td>Human Input</td>
              <td>
                <span className="human-ones">{humanOnes}</span> /
                <span className="human-zeros"> {humanZeros}</span>
              </td>
            </tr>
          )}
          <tr>
            <td>Status</td>
            <td>{dirty ? <span className="unsaved-badge">Unsaved changes</span> : 'Saved'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
