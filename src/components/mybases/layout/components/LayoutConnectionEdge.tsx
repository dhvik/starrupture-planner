import { memo } from 'react';
import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, getStraightPath } from '@xyflow/react';
import { dispatch } from '@flexsurfer/reflex';
import { EVENT_IDS } from '../../../../state/event-ids';
import type { BaseLayoutConnection } from '../../../../state/db';
import { getRailCapacity } from '../utils/layoutBalanceCalculator';

interface LayoutConnectionEdgeData {
  connection: BaseLayoutConnection;
  baseId: string;
}

const LayoutConnectionEdge = memo((props: EdgeProps) => {
  const { sourceX, sourceY, targetX, targetY, markerEnd, style } = props;
  const data = props.data as LayoutConnectionEdgeData | undefined;

  if (!data) {
    return null;
  }

  const { connection, baseId } = data;
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const capacity = getRailCapacity(connection.railTier);
  const tierName = `mk${connection.railTier}`;

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch([EVENT_IDS.BASES_LAYOUT_REMOVE_CONNECTION, baseId, connection.id]);
  };

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <div className="bg-base-200 border border-base-300 rounded-lg shadow-lg p-2 flex items-center gap-2">
            <div className="text-xs">
              <div className="font-bold">{tierName}</div>
              <div className="text-base-content/70">{capacity}/min</div>
            </div>
            <button
              onClick={handleRemove}
              className="btn btn-ghost btn-xs btn-circle"
              title="Remove connection"
            >
              ✕
            </button>
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

LayoutConnectionEdge.displayName = 'LayoutConnectionEdge';

export default LayoutConnectionEdge;
