import { useState, useRef, useCallback } from "react";
import { useSubscription, dispatch } from "@flexsurfer/reflex";
import { SUB_IDS } from "../../../../state/sub-ids";
import { EVENT_IDS } from "../../../../state/event-ids";
import type { BaseLayoutBalance, BaseLayoutConnection, Item } from "../../../../state/db";
import type { BuildingProductionState } from "../utils/layoutBalanceCalculator";
import { ItemImage } from "../../../ui";

interface BaseLayoutBalanceSummaryProps {
    baseId: string;
    className?: string;
}

const BaseLayoutBalanceSummary = ({ baseId, className }: BaseLayoutBalanceSummaryProps) => {
    const balance = useSubscription<BaseLayoutBalance[]>([SUB_IDS.BASES_LAYOUT_BALANCE_BY_BASE_ID, baseId]);
    const itemsById = useSubscription<Record<string, Item>>([SUB_IDS.ITEMS_BY_ID_MAP]);
    const buildingStates = useSubscription<Record<string, BuildingProductionState>>([
        SUB_IDS.BASES_LAYOUT_BUILDING_STATES_BY_BASE_ID,
        baseId,
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

    /** Returns all building IDs that produce or consume the given item. */
    const getBuildingIdsForItem = (itemId: string): string[] => {
        const ids: string[] = [];
        for (const [buildingId, state] of Object.entries(buildingStates ?? {})) {
            if (
                state.outputItemId === itemId ||
                state.inputRequirements.some((r) => r.itemId === itemId)
            ) {
                ids.push(buildingId);
            }
        }
        return ids;
    };

    /** Returns all connection IDs that transport the given item. */
    const getConnectionIdsForItem = (itemId: string): string[] =>
        (connections ?? []).filter((c) => c.itemId === itemId).map((c) => c.id);

    const handleRowClick = useCallback((itemId: string) => {
        const buildingIds = getBuildingIdsForItem(itemId);
        const connectionIds = getConnectionIdsForItem(itemId);
        dispatch([EVENT_IDS.BASES_LAYOUT_SET_SELECTION, buildingIds, connectionIds]);

        // Flash the clicked row briefly, then clear — no tie to global selection.
        if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
        setFlashedItemId(itemId);
        flashTimerRef.current = setTimeout(() => {
            setFlashedItemId(null);
            flashTimerRef.current = null;
        }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [buildingStates, connections]);

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
                            <th className="text-right" title="Production/Demand/Balance">P/D/B</th>
                        </tr>
                    </thead>
                    <tbody>
                        {imbalancedItems.map((item) => {
                            const itemData = itemsById[item.itemId];
                            const balanceValue = item.surplus - item.deficit;
                            const balanceClass = balanceValue > 0 ? "text-success" : balanceValue < 0 ? "text-error" : "";
                            const isFlashing = flashedItemId === item.itemId;

                            return (
                                <tr
                                    key={item.itemId}
                                    onClick={() => handleRowClick(item.itemId)}
                                    className={`cursor-pointer transition-colors duration-300 ${
                                        isFlashing
                                            ? "bg-primary/25"
                                            : "hover:bg-base-300"
                                    }`}
                                >
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <ItemImage itemId={item.itemId} size="small" />
                                            <span className="font-semibold">{itemData?.name || item.itemId}</span>
                                        </div>
                                    </td>
                                    <td className="text-right">
                                        {item.totalProduction.toFixed(1)}/{item.totalDemand.toFixed(1)}
                                        <span className={`font-bold ${balanceClass}`}>
                                            {" "}
                                            {balanceValue > 0 && "+"}
                                            {balanceValue.toFixed(1)}/min
                                        </span>
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
