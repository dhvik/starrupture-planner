import { useSubscription, dispatch } from "@flexsurfer/reflex";
import { SUB_IDS } from "../../../../state/sub-ids";
import { EVENT_IDS } from "../../../../state/event-ids";
import type {
  BaseLayoutBalance,
  BaseLayoutBuilding,
  Item,
} from "../../../../state/db";
import { ItemImage } from "../../../ui";

interface BaseLayoutBalanceBadgeProps {
  baseId: string;
  className?: string;
}

const BaseLayoutBalanceBadge = ({
  baseId,
  className,
}: BaseLayoutBalanceBadgeProps) => {
  const balance = useSubscription<BaseLayoutBalance[]>([
    SUB_IDS.BASES_LAYOUT_BALANCE_BY_BASE_ID,
    baseId,
  ]);
  const buildings = useSubscription<BaseLayoutBuilding[]>([
    SUB_IDS.BASES_LAYOUT_BUILDINGS_BY_BASE_ID,
    baseId,
  ]);
  const itemsById = useSubscription<Record<string, Item>>([
    SUB_IDS.ITEMS_BY_ID_MAP,
  ]);

  const surplusCount = balance.filter(
    (b) => b.surplus > 0 && b.deficit === 0,
  ).length;
  const deficitCount = balance.filter((b) => b.deficit > 0).length;

  // Aggregate total rate per item for receivers (inputs) and dispatchers (outputs)
  const receiverRates = new Map<string, number>();
  const dispatcherRates = new Map<string, number>();

  for (const b of buildings) {
    const isReceiver =
      b.buildingType === "receiver" || b.buildingId === "package_receiver";
    const isDispatcher =
      b.buildingType === "dispatcher" || b.buildingId === "package_dispatcher";
    if (isReceiver) {
      receiverRates.set(
        b.itemId,
        (receiverRates.get(b.itemId) ?? 0) + (b.receiverOutputRate ?? 100),
      );
    }
    if (isDispatcher) {
      dispatcherRates.set(
        b.itemId,
        (dispatcherRates.get(b.itemId) ?? 0) + (b.dispatcherInputRate ?? 100),
      );
    }
  }

  const hasBalance = surplusCount > 0 || deficitCount > 0;
  const hasReceivers = receiverRates.size > 0;
  const hasDispatchers = dispatcherRates.size > 0;

  if (!hasBalance && !hasReceivers && !hasDispatchers) {
    return null;
  }

  const openLayout = () =>
    dispatch([EVENT_IDS.BASES_OPEN_LAYOUT_DIRECTLY, baseId]);

  return (
    <div
      className={`grid grid-cols-3 gap-2 border-t border-base-300 pt-3 ${className ?? ""}`}
    >
      {/* Column 1: Inputs */}
      <div>
        <div className="text-xs text-base-content/50 mb-1">Inputs</div>
        {hasReceivers ? (
          <div className="flex flex-col gap-1">
            {[...receiverRates.entries()].map(([itemId, rate]) => {
              const item = itemsById[itemId];
              return item ? (
                <button
                  key={itemId}
                  className="flex items-center gap-1 text-left cursor-pointer hover:text-primary transition-colors"
                  onClick={openLayout}
                  title={`${item.name} — go to layout`}
                >
                  <ItemImage itemId={itemId} size="small" />
                  <span className="text-xs truncate">{item.name}</span>
                  <span className="text-xs text-base-content/50 flex-shrink-0">
                    {rate}/min
                  </span>
                </button>
              ) : null;
            })}
          </div>
        ) : (
          <span className="text-xs text-base-content/30">—</span>
        )}
      </div>

      {/* Column 2: Outputs */}
      <div>
        <div className="text-xs text-base-content/50 mb-1">Outputs</div>
        {hasDispatchers ? (
          <div className="flex flex-col gap-1">
            {[...dispatcherRates.entries()].map(([itemId, rate]) => {
              const item = itemsById[itemId];
              return item ? (
                <button
                  key={itemId}
                  className="flex items-center gap-1 text-left cursor-pointer hover:text-primary transition-colors"
                  onClick={openLayout}
                  title={`${item.name} — go to layout`}
                >
                  <ItemImage itemId={itemId} size="small" />
                  <span className="text-xs truncate">{item.name}</span>
                  <span className="text-xs text-base-content/50 flex-shrink-0">
                    {rate}/min
                  </span>
                </button>
              ) : null;
            })}
          </div>
        ) : (
          <span className="text-xs text-base-content/30">—</span>
        )}
      </div>

      {/* Column 3: Surplus / Deficit */}
      <div>
        <div className="text-xs text-base-content/50 mb-1">Balance</div>
        {hasBalance ? (
          <div className="flex flex-col gap-1">
            {surplusCount > 0 && (
              <button
                className="badge badge-success gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={openLayout}
                title="Go to layout"
              >
                <span>↑</span>
                <span>{surplusCount} surplus</span>
              </button>
            )}
            {deficitCount > 0 && (
              <button
                className="badge badge-error gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={openLayout}
                title="Go to layout"
              >
                <span>↓</span>
                <span>{deficitCount} deficit</span>
              </button>
            )}
          </div>
        ) : (
          <span className="text-xs text-base-content/30">—</span>
        )}
      </div>
    </div>
  );
};

export default BaseLayoutBalanceBadge;
