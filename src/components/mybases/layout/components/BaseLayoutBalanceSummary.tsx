import { useSubscription } from "@flexsurfer/reflex";
import { SUB_IDS } from "../../../../state/sub-ids";
import type { BaseLayoutBalance, Item } from "../../../../state/db";
import { ItemImage } from "../../../ui";

interface BaseLayoutBalanceSummaryProps {
    baseId: string;
    className?: string;
}

const BaseLayoutBalanceSummary = ({ baseId, className }: BaseLayoutBalanceSummaryProps) => {
    const balance = useSubscription<BaseLayoutBalance[]>([SUB_IDS.BASES_LAYOUT_BALANCE_BY_BASE_ID, baseId]);
    const itemsById = useSubscription<Record<string, Item>>([SUB_IDS.ITEMS_BY_ID_MAP]);

    // Filter to only show items with imbalance
    const imbalancedItems = balance.filter((b) => b.surplus > 0 || b.deficit > 0);
    //sort by lowest balance first
    imbalancedItems.sort((a, b) => {
        const balanceA = a.surplus - a.deficit;
        const balanceB = b.surplus - b.deficit;
        return balanceA - balanceB;
    });

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

                            return (
                                <tr key={item.itemId}>
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
