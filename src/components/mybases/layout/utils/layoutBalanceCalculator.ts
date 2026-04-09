import type {
  BaseLayout,
  BaseLayoutBalance,
  BuildingsByIdMap,
  BaseLayoutConnection,
} from "../../../../state/db";

/**
 * Rail tier capacity in items per minute
 */
const RAIL_CAPACITIES: Record<number, number> = {
  1: 120,
  2: 240,
  3: 480,
};

export interface BuildingProductionState {
  buildingId: string;
  outputItemId: string;
  maxOutputRate: number;
  actualOutputRate: number;
  consumedOutputRate: number; // How much of the output is actually being consumed by downstream buildings
  inputRequirements: Array<{
    itemId: string;
    requiredRate: number;
    suppliedRate: number;
  }>;
  productionFactor: number; // 0-1, based on input fulfillment
}

export interface LayoutBalanceResult {
  balances: BaseLayoutBalance[];
  buildingStates: Map<string, BuildingProductionState>;
  _timestamp?: number; // Forces unique object identity for Reflex reactivity
}

/**
 * Calculates the production/demand balance for all items in a layout.
 *
 * Model:
 * 1. Each building's production is scaled by the minimum input fulfillment ratio
 *    (e.g. if it gets 10/100 of one input, it produces at 10%).
 * 2. A building's actual output is distributed across outbound connectors,
 *    trying to satisfy each target's full input demand, limited by rail capacity.
 * 3. Iterative convergence handles cascading production chains.
 * 4. Surplus = production − amount transferred out via connectors.
 *    Deficit = full demand − amount transferred in via connectors.
 *
 * @param layout The base layout with buildings and connections
 * @param buildingsById Map of building definitions by ID
 * @returns Balance data and per-building production states
 */
export function calculateLayoutBalance(
  layout: BaseLayout | undefined,
  buildingsById: BuildingsByIdMap,
): LayoutBalanceResult {
  if (!layout || layout.buildings.length === 0) {
    return {
      balances: [],
      buildingStates: new Map(),
    };
  }

  // Phase 1: Build production state for each building
  const buildingStates = new Map<string, BuildingProductionState>();

  for (const layoutBuilding of layout.buildings) {
    const building = buildingsById[layoutBuilding.buildingId];
    if (!building || !building.recipes || building.recipes.length === 0) {
      continue;
    }

    const recipe = building.recipes[layoutBuilding.recipeIndex];
    if (!recipe) {
      continue;
    }

    const hasInputs = recipe.inputs.length > 0;
    const buildingCount = layoutBuilding.count || 1;
    const maxOutputRate = recipe.output.amount_per_minute * buildingCount;

    buildingStates.set(layoutBuilding.id, {
      buildingId: layoutBuilding.id,
      outputItemId: recipe.output.id,
      maxOutputRate,
      actualOutputRate: hasInputs ? 0 : maxOutputRate, // Extractors at 100%
      consumedOutputRate: 0,
      inputRequirements: recipe.inputs.map((input) => ({
        itemId: input.id,
        requiredRate: input.amount_per_minute * buildingCount,
        suppliedRate: 0,
      })),
      productionFactor: hasInputs ? 0 : 1,
    });
  }

  // Phase 2: Iteratively calculate production with connector-based supply
  const MAX_ITERATIONS = 10;
  const CONVERGENCE_THRESHOLD = 0.01;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let maxChange = 0;

    // Allocate output via connectors and compute supply per target input
    const { suppliedPerInput } = allocateConnectors(
      layout.connections,
      buildingStates,
    );

    // Update each building's supply, production factor, and output
    for (const [buildingId, state] of buildingStates) {
      if (state.inputRequirements.length === 0) continue; // Extractors don't change

      // Update supplied rates from connector allocation
      for (const inputReq of state.inputRequirements) {
        const key = `${buildingId}:${inputReq.itemId}`;
        inputReq.suppliedRate = Math.min(
          suppliedPerInput.get(key) || 0,
          inputReq.requiredRate,
        );
      }

      // Production factor = minimum fulfillment ratio across all inputs
      let minFulfillment = 1;
      for (const inputReq of state.inputRequirements) {
        const ratio =
          inputReq.requiredRate > 0
            ? Math.min(1, inputReq.suppliedRate / inputReq.requiredRate)
            : 1;
        minFulfillment = Math.min(minFulfillment, ratio);
      }

      const oldOutputRate = state.actualOutputRate;
      state.productionFactor = minFulfillment;
      state.actualOutputRate = state.maxOutputRate * minFulfillment;

      maxChange = Math.max(
        maxChange,
        Math.abs(state.actualOutputRate - oldOutputRate),
      );
    }

    if (maxChange < CONVERGENCE_THRESHOLD) {
      break;
    }
  }

  // Phase 3: Final connector allocation to get consumedOutputRate
  const { consumedPerSource, suppliedPerInput } = allocateConnectors(
    layout.connections,
    buildingStates,
  );

  for (const [buildingId, state] of buildingStates) {
    state.consumedOutputRate = consumedPerSource.get(buildingId) || 0;
  }

  // Phase 4: Aggregate balance per item using connector-based surplus/deficit
  const itemProduction = new Map<string, number>();
  const itemDemand = new Map<string, number>();
  const itemTransferredOut = new Map<string, number>();
  const itemTransferredIn = new Map<string, number>();

  for (const state of buildingStates.values()) {
    const outputId = state.outputItemId;
    itemProduction.set(
      outputId,
      (itemProduction.get(outputId) || 0) + state.actualOutputRate,
    );
    itemTransferredOut.set(
      outputId,
      (itemTransferredOut.get(outputId) || 0) + state.consumedOutputRate,
    );

    for (const inputReq of state.inputRequirements) {
      itemDemand.set(
        inputReq.itemId,
        (itemDemand.get(inputReq.itemId) || 0) + inputReq.requiredRate,
      );
      const key = `${state.buildingId}:${inputReq.itemId}`;
      const supplied = suppliedPerInput.get(key) || 0;
      itemTransferredIn.set(
        inputReq.itemId,
        (itemTransferredIn.get(inputReq.itemId) || 0) + supplied,
      );
    }
  }

  const allItemIds = new Set([...itemProduction.keys(), ...itemDemand.keys()]);

  const balances: BaseLayoutBalance[] = [];
  for (const itemId of allItemIds) {
    const production = itemProduction.get(itemId) || 0;
    const demand = itemDemand.get(itemId) || 0;
    const transferredOut = itemTransferredOut.get(itemId) || 0;
    const transferredIn = itemTransferredIn.get(itemId) || 0;

    // Surplus = production that isn't sent out via connectors
    const surplus = Math.max(0, production - transferredOut);

    // Deficit = demand that isn't satisfied via connectors
    const deficit = Math.max(0, demand - transferredIn);

    balances.push({
      itemId,
      totalProduction: production,
      totalDemand: demand,
      surplus,
      deficit,
    });
  }

  // Sort by item ID for consistent ordering
  balances.sort((a, b) => a.itemId.localeCompare(b.itemId));

  // Create a new Map to ensure Reflex detects changes (reference equality)
  // Add timestamp to force new object identity
  return {
    balances,
    buildingStates: new Map(buildingStates),
    _timestamp: Date.now(), // Force unique object identity
  };
}

export interface ConnectionTransferRate {
  connectionId: string;
  currentRate: number;
  maxRate: number;
  tierName: string;
}

/**
 * Allocates output across connectors, distributing each source building's
 * actualOutputRate to outbound connectors limited by rail capacity and
 * target's full requiredRate.
 *
 * Returns:
 * - consumedPerSource: total output consumed via connectors per source building
 * - suppliedPerInput: total supplied per target input (`${buildingId}:${itemId}`)
 * - perConnection: rate per connection ID
 */
function allocateConnectors(
  connections: BaseLayoutConnection[],
  buildingStates: Map<string, BuildingProductionState>,
): {
  consumedPerSource: Map<string, number>;
  suppliedPerInput: Map<string, number>;
  perConnection: Map<string, number>;
} {
  const consumedPerSource = new Map<string, number>();
  const suppliedPerInput = new Map<string, number>();
  const perConnection = new Map<string, number>();

  // Group outbound connections by source building
  const outboundBySource = new Map<string, BaseLayoutConnection[]>();
  for (const conn of connections) {
    if (!outboundBySource.has(conn.fromBuildingId)) {
      outboundBySource.set(conn.fromBuildingId, []);
    }
    outboundBySource.get(conn.fromBuildingId)!.push(conn);
  }

  for (const [sourceBuildingId, outbound] of outboundBySource) {
    const sourceState = buildingStates.get(sourceBuildingId);
    if (!sourceState) {
      for (const conn of outbound) {
        perConnection.set(conn.id, 0);
      }
      continue;
    }

    let remainingOutput = sourceState.actualOutputRate;

    for (const conn of outbound) {
      const railCapacity = RAIL_CAPACITIES[conn.railTier] || 0;

      // Target's remaining demand for this item (full requiredRate, not scaled)
      // If no target or no matching input requirement, transfer 0
      const targetState = buildingStates.get(conn.toBuildingId);
      let targetRemainingInput = 0;

      if (targetState) {
        const inputReq = targetState.inputRequirements.find(
          (r) => r.itemId === conn.itemId,
        );
        if (inputReq) {
          const inboundKey = `${conn.toBuildingId}:${conn.itemId}`;
          const alreadyAllocated = suppliedPerInput.get(inboundKey) || 0;
          targetRemainingInput = Math.max(
            0,
            inputReq.requiredRate - alreadyAllocated,
          );
        }
      }

      const rate = Math.min(
        railCapacity,
        remainingOutput,
        targetRemainingInput,
      );
      perConnection.set(conn.id, rate);

      remainingOutput -= rate;
      consumedPerSource.set(
        sourceBuildingId,
        (consumedPerSource.get(sourceBuildingId) || 0) + rate,
      );
      const inboundKey = `${conn.toBuildingId}:${conn.itemId}`;
      suppliedPerInput.set(
        inboundKey,
        (suppliedPerInput.get(inboundKey) || 0) + rate,
      );
    }
  }

  return { consumedPerSource, suppliedPerInput, perConnection };
}

/**
 * Calculates the current transfer rate for each connection.
 *
 * Distributes each source building's actualOutputRate across outbound
 * connectors, limited by rail capacity and target's full input demand.
 */
export function calculateConnectionTransferRates(
  layout: BaseLayout | undefined,
  buildingStates: Map<string, BuildingProductionState>,
): Map<string, ConnectionTransferRate> {
  const result = new Map<string, ConnectionTransferRate>();

  if (!layout || layout.connections.length === 0) {
    return result;
  }

  const { perConnection } = allocateConnectors(
    layout.connections,
    buildingStates,
  );

  for (const conn of layout.connections) {
    const railCapacity = RAIL_CAPACITIES[conn.railTier] || 0;
    result.set(conn.id, {
      connectionId: conn.id,
      currentRate: perConnection.get(conn.id) || 0,
      maxRate: railCapacity,
      tierName: `mk${conn.railTier}`,
    });
  }

  return result;
}

/**
 * Gets the rail tier capacity in items per minute
 */
export function getRailCapacity(tier: number): number {
  return RAIL_CAPACITIES[tier] || 0;
}

/**
 * Gets all available rail tiers with their capacities
 */
export function getAvailableRailTiers(): Array<{
  tier: number;
  capacity: number;
}> {
  return [
    { tier: 1, capacity: 120 },
    { tier: 2, capacity: 240 },
    { tier: 3, capacity: 480 },
  ];
}
