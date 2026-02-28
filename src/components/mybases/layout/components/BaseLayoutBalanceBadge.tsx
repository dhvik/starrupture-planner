import { useSubscription } from '@flexsurfer/reflex';
import { SUB_IDS } from '../../../../state/sub-ids';
import type { BaseLayoutBalance } from '../../../../state/db';

interface BaseLayoutBalanceBadgeProps {
  baseId: string;
  className?: string;
}

const BaseLayoutBalanceBadge = ({ baseId, className }: BaseLayoutBalanceBadgeProps) => {
  const balance = useSubscription<BaseLayoutBalance[]>([SUB_IDS.BASES_LAYOUT_BALANCE_BY_BASE_ID, baseId]);

  const surplusCount = balance.filter(b => b.surplus > 0 && b.deficit === 0).length;
  const deficitCount = balance.filter(b => b.deficit > 0).length;

  if (surplusCount === 0 && deficitCount === 0) {
    return null;
  }

  return (
    <div className={`flex gap-2 ${className}`}>
      {surplusCount > 0 && (
        <div className="badge badge-success gap-1">
          <span>↑</span>
          <span>{surplusCount} surplus</span>
        </div>
      )}
      {deficitCount > 0 && (
        <div className="badge badge-error gap-1">
          <span>↓</span>
          <span>{deficitCount} deficit</span>
        </div>
      )}
    </div>
  );
};

export default BaseLayoutBalanceBadge;
