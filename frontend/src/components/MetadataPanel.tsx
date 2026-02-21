interface Props {
  episodeId: number;
  numFrames: number;
  success: boolean;
  maxReward: number;
  improvement: number[];
  dirty: boolean;
}

export default function MetadataPanel({
  episodeId,
  numFrames,
  success,
  maxReward,
  improvement,
  dirty,
}: Props) {
  const onesCount = improvement.filter((v) => v === 1).length;
  const zerosCount = improvement.length - onesCount;

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
          <tr>
            <td>Status</td>
            <td>{dirty ? <span className="unsaved-badge">Unsaved changes</span> : 'Saved'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
