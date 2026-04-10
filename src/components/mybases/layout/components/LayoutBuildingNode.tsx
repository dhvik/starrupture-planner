import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { useSubscription, dispatch } from "@flexsurfer/reflex";
import { SUB_IDS } from "../../../../state/sub-ids";
import { EVENT_IDS } from "../../../../state/event-ids";
import type {
  BaseLayoutBuilding,
  Building,
  Item,
  RailTier,
} from "../../../../state/db";
import { BuildingImage, ItemImage } from "../../../ui";
import { calculateBuildingResourceTags } from "../utils/buildingResourceCalculator";
import type { BuildingProductionState } from "../utils/layoutBalanceCalculator";

interface LayoutBuildingNodeData {
  building: BaseLayoutBuilding;
  baseId: string;
  connectorMode?: RailTier | null;
  isConnectionSource?: boolean;
  selected?: boolean;
}

const LayoutBuildingNode = memo((props: NodeProps) => {
  const data = props.data as unknown as LayoutBuildingNodeData;
  const { building, baseId, connectorMode, isConnectionSource, selected } =
    data;

  const buildingsById = useSubscription<Record<string, Building>>([
    SUB_IDS.BUILDINGS_BY_ID_MAP,
  ]);
  const itemsById = useSubscription<Record<string, Item>>([
    SUB_IDS.ITEMS_BY_ID_MAP,
  ]);
  const buildingStates = useSubscription<
    Record<string, BuildingProductionState>
  >([SUB_IDS.BASES_LAYOUT_BUILDING_STATES_BY_BASE_ID, baseId]);

  const handleToggleMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch([
      EVENT_IDS.BASES_LAYOUT_TOGGLE_BUILDING_MODE,
      baseId,
      building.id,
    ]);
  };

  const currentMode = building.mode || "edit";
  const isSummaryMode = currentMode === "summary";

  const formatRate = (rate: number): string => rate.toFixed(0);

  const renderOutputRate = (
    fallbackRate: number,
    productionState?: BuildingProductionState,
  ) => {
    const actualRate = productionState?.actualOutputRate ?? fallbackRate;
    const consumedRate = productionState?.consumedOutputRate ?? actualRate;
    const surplusRate = Math.max(0, actualRate - consumedRate);

    if (surplusRate <= 0) {
      return <>{formatRate(actualRate)}/min</>;
    }

    return (
      <>
        {formatRate(consumedRate)}/
        <span className="text-success font-semibold">
          +{formatRate(surplusRate)}
        </span>
        /min
      </>
    );
  };

  const hasSurplusOutput = (
    productionState?: BuildingProductionState,
  ): boolean => {
    if (!productionState) {
      return false;
    }

    return (
      productionState.actualOutputRate > productionState.consumedOutputRate
    );
  };

  const getStateVisualClasses = (
    hasDeficit: boolean,
    hasSurplus: boolean,
  ): {
    borderClass: string;
    backgroundClass: string;
    summaryBackgroundClass: string;
  } => {
    if (hasDeficit) {
      return {
        borderClass: "border-error",
        backgroundClass: "bg-error/12",
        summaryBackgroundClass: "bg-error/18",
      };
    }

    if (hasSurplus) {
      return {
        borderClass: "border-success",
        backgroundClass: "bg-success/12",
        summaryBackgroundClass: "bg-success/18",
      };
    }

    return {
      borderClass: "border-base-content/30",
      backgroundClass: "bg-base-300",
      summaryBackgroundClass: "bg-base-300/80",
    };
  };

  if (building.buildingType === "receiver") {
    const item = itemsById[building.itemId];
    const productionState = buildingStates?.[building.id];
    const outputRate = building.receiverOutputRate || 100;

    if (!item) {
      return (
        <div className="bg-error text-error-content p-2 rounded">
          Invalid receiver item
        </div>
      );
    }

    const receiverVisualClasses = getStateVisualClasses(
      false,
      hasSurplusOutput(productionState),
    );

    const borderClass = isConnectionSource
      ? "border-primary !border-4 shadow-2xl"
      : selected
        ? "border-info !border-4 shadow-2xl"
        : connectorMode
          ? "border-primary border-dashed"
          : receiverVisualClasses.borderClass;

    const containerClass = isSummaryMode
      ? `backdrop-blur-md ${receiverVisualClasses.summaryBackgroundClass} rounded-lg border-2 ${borderClass} shadow-xl p-3 min-w-[180px] transition-all`
      : `${receiverVisualClasses.backgroundClass} rounded-lg border-2 ${borderClass} shadow-lg p-3 min-w-[180px] transition-all`;

    const handleRemove = (e: React.MouseEvent) => {
      e.stopPropagation();
      dispatch([EVENT_IDS.BASES_LAYOUT_REMOVE_BUILDING, baseId, building.id]);
    };

    const handleOutputRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newRate = parseInt(e.target.value, 10);
      if (newRate > 0) {
        dispatch([
          EVENT_IDS.BASES_LAYOUT_UPDATE_RECEIVER_OUTPUT_RATE,
          baseId,
          building.id,
          newRate,
        ]);
      }
    };

    return (
      <>
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-primary"
        />
        <div
          className={`${containerClass} ${
            connectorMode
              ? "cursor-pointer hover:ring-4 hover:ring-primary/50 hover:shadow-2xl"
              : ""
          } ${isConnectionSource ? "ring-4 ring-primary animate-pulse" : ""} ${
            selected ? "ring-4 ring-info/40" : ""
          }`}
          style={{ pointerEvents: "all" }}
        >
          {isConnectionSource && (
            <div className="absolute -top-2 -right-2 bg-primary text-primary-content text-xs font-bold px-2 py-1 rounded-full shadow-lg z-10">
              SOURCE
            </div>
          )}

          <div className="flex items-center justify-between mb-2 gap-1">
            <div
              className="font-bold text-sm cursor-pointer hover:text-primary"
              onDoubleClick={handleToggleMode}
              title="Double-click to toggle view mode"
            >
              Package Receiver
            </div>
            {!isSummaryMode && (
              <button
                onClick={handleRemove}
                className="btn btn-ghost btn-xs btn-circle flex-shrink-0"
                title="Remove receiver"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex justify-center mb-2">
            <BuildingImage buildingId="package_receiver" size="large" />
          </div>

          <div className="rounded p-2 bg-base-300">
            <div className="flex items-center gap-2">
              <ItemImage itemId={item.id} size="small" />
              <div className="flex-1">
                <div className="text-xs font-semibold truncate">
                  {item.name}
                </div>
                {!isSummaryMode && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      value={outputRate}
                      onChange={handleOutputRateChange}
                      onClick={(e) => e.stopPropagation()}
                      className="input input-xs w-16 bg-base-100"
                    />
                    <span className="text-xs text-base-content/70">/min</span>
                  </div>
                )}
                {isSummaryMode && (
                  <div className="text-xs text-base-content/70">
                    {renderOutputRate(outputRate, productionState)}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-2 flex gap-2 text-xs text-base-content/70">
            <div>⚡ 40</div>
            <div>🔥 40</div>
          </div>
        </div>
      </>
    );
  }

  const buildingDef = buildingsById[building.buildingId];
  const item = itemsById[building.itemId];
  const recipe = buildingDef?.recipes?.[building.recipeIndex];
  const productionState = buildingStates?.[building.id];

  if (!buildingDef || !item || !recipe) {
    return (
      <div className="bg-error text-error-content p-2 rounded">
        Invalid building
      </div>
    );
  }

  const resourceTags = calculateBuildingResourceTags(
    building,
    buildingDef,
    productionState,
  );

  const hasUnmetInputs = resourceTags.some(
    (tag) => tag.type === "input" && !tag.satisfied,
  );
  const hasSurplus = hasSurplusOutput(productionState);
  const buildingVisualClasses = getStateVisualClasses(
    hasUnmetInputs,
    hasSurplus,
  );

  let borderClass = buildingVisualClasses.borderClass;

  if (isConnectionSource) {
    borderClass = "border-primary !border-4 shadow-2xl";
  } else if (selected) {
    borderClass = "border-info !border-4 shadow-2xl";
  } else if (connectorMode) {
    borderClass = "border-primary border-dashed";
  }

  const containerClass = isSummaryMode
    ? `backdrop-blur-md ${buildingVisualClasses.summaryBackgroundClass} rounded-lg border-2 ${borderClass} shadow-xl p-3 min-w-[180px] transition-all`
    : `${buildingVisualClasses.backgroundClass} rounded-lg border-2 ${borderClass} shadow-lg p-3 min-w-[180px] transition-all`;

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch([EVENT_IDS.BASES_LAYOUT_REMOVE_BUILDING, baseId, building.id]);
  };

  const handleCountChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCount = parseInt(e.target.value, 10);
    dispatch([
      EVENT_IDS.BASES_LAYOUT_UPDATE_BUILDING_COUNT,
      baseId,
      building.id,
      newCount,
    ]);
  };

  const buildingCount = building.count || 1;

  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <div
        className={`${containerClass} ${
          connectorMode
            ? "cursor-pointer hover:ring-4 hover:ring-primary/50 hover:shadow-2xl"
            : ""
        } ${isConnectionSource ? "ring-4 ring-primary animate-pulse" : ""} ${
          selected ? "ring-4 ring-info/40" : ""
        }`}
        style={{ pointerEvents: "all" }}
      >
        {isConnectionSource && (
          <div className="absolute -top-2 -right-2 bg-primary text-primary-content text-xs font-bold px-2 py-1 rounded-full shadow-lg z-10">
            SOURCE
          </div>
        )}

        <div className="flex items-center justify-between mb-2 gap-1">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {!isSummaryMode && (
              <>
                <select
                  value={buildingCount}
                  onChange={handleCountChange}
                  onClick={(e) => e.stopPropagation()}
                  className="appearance-none bg-base-300 hover:bg-base-100 rounded px-1 py-0.5 text-xs font-bold cursor-pointer border border-base-content/20 w-[28px] text-center bg-[length:8px_8px] bg-no-repeat bg-[center_right_2px]"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3E%3Cpath fill='%23666' d='M0 2l4 4 4-4z'/%3E%3C/svg%3E")`,
                  }}
                  title="Number of buildings"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-semibold text-base-content/50">
                  ×
                </span>
              </>
            )}
            <div
              className="font-bold text-sm truncate cursor-pointer hover:text-primary"
              onDoubleClick={handleToggleMode}
              title="Double-click to toggle view mode"
            >
              {buildingDef.name}
            </div>
          </div>
          {!isSummaryMode && (
            <button
              onClick={handleRemove}
              className="btn btn-ghost btn-xs btn-circle flex-shrink-0"
              title="Remove building"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex justify-center mb-2">
          <BuildingImage buildingId={buildingDef.id} size="medium" />
        </div>

        <div className="rounded p-2 bg-base-300">
          <div className="flex items-center gap-2">
            <ItemImage itemId={item.id} size="small" />
            <div className="flex-1">
              <div className="text-xs font-semibold truncate">{item.name}</div>
              <div className="text-xs text-base-content/70">
                {renderOutputRate(
                  recipe.output.amount_per_minute,
                  productionState,
                )}
              </div>
            </div>
          </div>
          {!isSummaryMode && productionState && (
            <div className="mt-2">
              <div className="flex justify-between text-xs mb-1">
                <span
                  className={`font-semibold ${
                    productionState.productionFactor === 0
                      ? "text-error"
                      : productionState.productionFactor < 0.99
                        ? "text-warning"
                        : "text-success"
                  }`}
                >
                  {(productionState.productionFactor * 100).toFixed(0)}%
                </span>
                <span className="text-base-content/70">
                  {productionState.actualOutputRate.toFixed(0)}/
                  {productionState.maxOutputRate.toFixed(0)} /min
                </span>
              </div>
              <div className="h-1.5 bg-base-100 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    productionState.productionFactor === 0
                      ? "bg-error"
                      : productionState.productionFactor < 0.99
                        ? "bg-warning"
                        : "bg-success"
                  }`}
                  style={{
                    width: `${productionState.productionFactor * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {resourceTags.length > 0 && (
          <div className="mt-2 space-y-1">
            {resourceTags.map((tag) => {
              const tagItem = itemsById[tag.itemId];
              if (!tagItem) return null;

              if (tag.type === "output") return null;
              if (isSummaryMode && tag.fulfillmentRatio >= 0.99) {
                return null;
              }

              let bgClass = "bg-base-300";
              let textClass = "";

              if (tag.fulfillmentRatio === 0) {
                bgClass = "bg-error/20";
                textClass = "text-error font-semibold";
              } else if (tag.fulfillmentRatio < 0.99) {
                bgClass = "bg-warning/20";
                textClass = "text-warning font-semibold";
              }

              return (
                <div
                  key={tag.itemId}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${bgClass} ${textClass}`}
                >
                  <ItemImage itemId={tag.itemId} size="small" />
                  <span className="flex-1 truncate">{tagItem.name}</span>
                  <span className="font-bold whitespace-nowrap">
                    {tag.rate.toFixed(0)}
                    {tag.rate < tag.maxRate && (
                      <span className="opacity-50">
                        /{tag.maxRate.toFixed(0)}
                      </span>
                    )}
                    /min
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-2 flex gap-2 text-xs text-base-content/70">
          {buildingDef.power && <div>⚡ {buildingDef.power}</div>}
          {buildingDef.heat && <div>🔥 {buildingDef.heat}</div>}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-primary" />
    </>
  );
});

LayoutBuildingNode.displayName = "LayoutBuildingNode";

export default LayoutBuildingNode;
