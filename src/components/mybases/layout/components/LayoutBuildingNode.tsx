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
}

const LayoutBuildingNode = memo((props: NodeProps) => {
  const data = props.data as unknown as LayoutBuildingNodeData;
  const { building, baseId, connectorMode, isConnectionSource } = data;

  const buildingsById = useSubscription<Record<string, Building>>([
    SUB_IDS.BUILDINGS_BY_ID_MAP,
  ]);
  const itemsById = useSubscription<Record<string, Item>>([
    SUB_IDS.ITEMS_BY_ID_MAP,
  ]);
  const buildingStates = useSubscription<
    Record<string, BuildingProductionState>
  >([SUB_IDS.BASES_LAYOUT_BUILDING_STATES_BY_BASE_ID, baseId]);

  // Handle package receivers
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

    const borderClass = isConnectionSource
      ? "border-primary !border-4 shadow-2xl"
      : connectorMode
        ? "border-primary border-dashed"
        : "border-info";

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
          className={`bg-base-200 rounded-lg border-2 ${borderClass} shadow-lg p-3 min-w-[180px] transition-all ${
            connectorMode
              ? "cursor-pointer hover:ring-4 hover:ring-primary/50 hover:shadow-2xl"
              : ""
          } ${isConnectionSource ? "ring-4 ring-primary animate-pulse" : ""}`}
          style={{ pointerEvents: "all" }}
        >
          {isConnectionSource && (
            <div className="absolute -top-2 -right-2 bg-primary text-primary-content text-xs font-bold px-2 py-1 rounded-full shadow-lg z-10">
              SOURCE
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between mb-2 gap-1">
            <div className="font-bold text-sm">Package Receiver</div>
            <button
              onClick={handleRemove}
              className="btn btn-ghost btn-xs btn-circle flex-shrink-0"
              title="Remove receiver"
            >
              ✕
            </button>
          </div>

          {/* Receiver icon */}
          <div className="flex justify-center mb-2">
            <BuildingImage buildingId="package_receiver" size="large" />
          </div>

          {/* Item output */}
          <div className="bg-base-300 rounded p-2">
            <div className="flex items-center gap-2">
              <ItemImage itemId={item.id} size="small" />
              <div className="flex-1">
                <div className="text-xs font-semibold truncate">
                  {item.name}
                </div>
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
              </div>
            </div>
          </div>

          {/* Surplus output */}
          {productionState &&
            productionState.actualOutputRate > 0 &&
            productionState.consumedOutputRate <
              productionState.actualOutputRate && (
              <div className="mt-2">
                <div className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-success/20 text-success font-semibold">
                  <ItemImage itemId={item.id} size="small" />
                  <span className="flex-1 truncate">{item.name}</span>
                  <span className="font-bold whitespace-nowrap">
                    +
                    {(
                      productionState.actualOutputRate -
                      productionState.consumedOutputRate
                    ).toFixed(0)}
                    /min
                  </span>
                </div>
              </div>
            )}

          {/* Stats */}
          <div className="mt-2 flex gap-2 text-xs text-base-content/70">
            <div>⚡ 40</div>
            <div>🔥 40</div>
          </div>
        </div>
      </>
    );
  }

  // Regular production building rendering
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

  // Calculate resource tags for this building (with production state for scaling)
  const resourceTags = calculateBuildingResourceTags(
    building,
    buildingDef,
    productionState,
  );

  // Determine border color based on resource status
  const hasUnmetInputs = resourceTags.some(
    (tag) => tag.type === "input" && !tag.satisfied,
  );
  const isThrottled =
    productionState && productionState.productionFactor < 0.99;

  let borderClass = hasUnmetInputs ? "border-error" : "border-success";
  if (isThrottled && !hasUnmetInputs) {
    borderClass = "border-warning"; // Partially running
  }

  // Override border if in connector mode
  if (isConnectionSource) {
    borderClass = "border-primary !border-4 shadow-2xl";
  } else if (connectorMode) {
    borderClass = "border-primary border-dashed";
  }

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

  const buildingCount = building.count || 1; // Default to 1 for backwards compatibility

  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <div
        className={`bg-base-200 rounded-lg border-2 ${borderClass} shadow-lg p-3 min-w-[180px] transition-all ${
          connectorMode
            ? "cursor-pointer hover:ring-4 hover:ring-primary/50 hover:shadow-2xl"
            : ""
        } ${isConnectionSource ? "ring-4 ring-primary animate-pulse" : ""}`}
        style={{ pointerEvents: "all" }}
      >
        {/* Connector mode indicator */}
        {isConnectionSource && (
          <div className="absolute -top-2 -right-2 bg-primary text-primary-content text-xs font-bold px-2 py-1 rounded-full shadow-lg z-10">
            SOURCE
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between mb-2 gap-1">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
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
            <div className="font-bold text-sm truncate">{buildingDef.name}</div>
          </div>
          <button
            onClick={handleRemove}
            className="btn btn-ghost btn-xs btn-circle flex-shrink-0"
            title="Remove building"
          >
            ✕
          </button>
        </div>

        {/* Building icon */}
        <div className="flex justify-center mb-2">
          <BuildingImage buildingId={buildingDef.id} size="medium" />
        </div>

        {/* Item output */}
        <div className="bg-base-300 rounded p-2">
          <div className="flex items-center gap-2">
            <ItemImage itemId={item.id} size="small" />
            <div className="flex-1">
              <div className="text-xs font-semibold truncate">{item.name}</div>
              <div className="text-xs text-base-content/70">
                {recipe.output.amount_per_minute}/min
              </div>
            </div>
          </div>
          {/* Production progress bar */}
          {productionState && (
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

        {/* Resource tags (inputs only) */}
        {resourceTags.length > 0 && (
          <div className="mt-2 space-y-1">
            {resourceTags.map((tag) => {
              const tagItem = itemsById[tag.itemId];
              if (!tagItem) return null;

              const isOutput = tag.type === "output";

              // Skip output tags - they're shown in the main output section
              if (isOutput) return null;

              // Color scheme for inputs:
              // - Input (fully satisfied): neutral
              // - Input (partial): yellow/warning
              // - Input (none): red/error
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

        {/* Surplus output (unused production) */}
        {productionState &&
          productionState.actualOutputRate > 0 &&
          productionState.consumedOutputRate <
            productionState.actualOutputRate && (
            <div className="mt-2">
              <div className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-success/20 text-success font-semibold">
                <ItemImage itemId={item.id} size="small" />
                <span className="flex-1 truncate">{item.name}</span>
                <span className="font-bold whitespace-nowrap">
                  +
                  {(
                    productionState.actualOutputRate -
                    productionState.consumedOutputRate
                  ).toFixed(0)}
                  /min
                </span>
              </div>
            </div>
          )}

        {/* Stats */}
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
