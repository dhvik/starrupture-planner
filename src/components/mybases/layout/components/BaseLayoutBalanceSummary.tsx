import { useState, useRef, useCallback } from "react";
import { useSubscription, dispatch } from "@flexsurfer/reflex";
import { SUB_IDS } from "../../../../state/sub-ids";
import { EVENT_IDS } from "../../../../state/event-ids";
import type {
  BaseLayoutBalance,
  BaseLayoutBuilding,
  BaseLayoutConnection,
  Building,
  Item,
} from "../../../../state/db";
import { resolveLayoutBuildingRecipe } from "../../../../utils/recipeSelection";
import { ItemImage } from "../../../ui";

interface BaseLayoutBalanceSummaryProps {
  baseId: string;
  className?: string;
}

const BaseLayoutBalanceSummary = ({
  baseId,
  className,
}: BaseLayoutBalanceSummaryProps) => {
  const balance = useSubscription<BaseLayoutBalance[]>([
    SUB_IDS.BASES_LAYOUT_BALANCE_BY_BASE_ID,
    baseId,
  ]);
  const itemsById = useSubscription<Record<string, Item>>([
    SUB_IDS.ITEMS_BY_ID_MAP,
  ]);
  const layoutBuildings = useSubscription<BaseLayoutBuilding[]>([
    SUB_IDS.BASES_LAYOUT_BUILDINGS_BY_BASE_ID,
    baseId,
  ]);
  const buildingsById = useSubscription<Record<string, Building>>([
    SUB_IDS.BUILDINGS_BY_ID_MAP,
  ]);
  const connections = useSubscription<BaseLayoutConnection[]>([
    SUB_IDS.BASES_LAYOUT_CONNECTIONS_BY_BASE_ID,
    baseId,
  ]);
  // Brief flash on the clicked row — independent of global selection state to
  // avoid feedback loops (a selected building can produce/consume many items).
  const [flashedItemId, setFlashedItemId] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter to only show items with imbalance
  const imbalancedItems = balance.filter((b) => b.surplus > 0 || b.deficit > 0);
  //sort by lowest balance first
  imbalancedItems.sort((a, b) => {
    const balanceA = a.surplus - a.deficit;
    const balanceB = b.surplus - b.deficit;
    return balanceA - balanceB;
  });

  const handleRowClick = useCallback(
    (itemId: string) => {
      const buildingIds: string[] = [];
      for (const lb of layoutBuildings ?? []) {
        const isReceiver =
          lb.buildingType === "receiver" ||
          lb.buildingId === "package_receiver";
        if (isReceiver) {
          if (lb.itemId === itemId) buildingIds.push(lb.id);
          continue;
        }
        const building = buildingsById?.[lb.buildingId];
        const recipe = resolveLayoutBuildingRecipe(lb, building);
        if (!recipe) continue;
        if (
          recipe.output.id === itemId ||
          recipe.inputs.some((i) => i.id === itemId)
        ) {
          buildingIds.push(lb.id);
        }
      }

      const connectionIds = (connections ?? [])
        .filter((c) => c.itemId === itemId)
        .map((c) => c.id);

      dispatch([
        EVENT_IDS.BASES_LAYOUT_SET_SELECTION,
        buildingIds,
        connectionIds,
      ]);

      // Flash the clicked row briefly, then clear — no tie to global selection state to
      // avoid feedback loops.
      if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
      setFlashedItemId(itemId);
      flashTimerRef.current = setTimeout(() => {
        setFlashedItemId(null);
        flashTimerRef.current = null;
      }, 600);
    },
    [layoutBuildings, buildingsById, connections],
  );

  if (imbalancedItems.length === 0) {
    return (
      <div className={`alert alert-success ${className}`}>
        <span>✅ All production balanced! No surpluses or deficits.</span>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Item</th>
              <th className="text-right" title="Production/Demand/Balance">
                P/D/B
              </th>
            </tr>
          </thead>
          <tbody>
            {imbalancedItems.map((item) => {
              const itemData = itemsById[item.itemId];
              const balanceValue = item.surplus - item.deficit;
              const balanceClass =
                balanceValue > 0
                  ? "text-success"
                  : balanceValue < 0
                    ? "text-error"
                    : "";
              const isFlashing = flashedItemId === item.itemId;

              return (
                <tr
                  key={item.itemId}
                  onClick={() => handleRowClick(item.itemId)}
                  className={`cursor-pointer transition-colors duration-300 ${
                    isFlashing ? "bg-primary/25" : "hover:bg-base-300"
                  }`}
                >
                  <td>
                    <div className="flex items-center gap-2">
                      <ItemImage itemId={item.itemId} size="small" />
                      <span className="font-semibold">
                        {itemData?.name || item.itemId}
                      </span>
                    </div>
                  </td>
                  <td className="text-right">
                    <div className="flex flex-col items-end leading-tight">
                      <span>
                        {item.totalProduction.toFixed(1)}/
                        {item.totalDemand.toFixed(1)}
                      </span>
                      <span className={`font-bold ${balanceClass}`}>
                        {balanceValue > 0 && "+"}
                        {balanceValue.toFixed(1)}/min
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BaseLayoutBalanceSummary;
