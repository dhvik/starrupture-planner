import type { BaseLayout, BaseLayoutBalance, BuildingsByIdMap, BaseLayoutConnection } from '../../../../state/db';

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
    inputRequirements: Array<{ itemId: string; requiredRate: number; suppliedRate: number }>;
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
 * Algorithm with input-driven production:
 * 1. Build production state for each building
 * 2. Calculate input supply from connections (limited by rail capacity and upstream production)
 * 3. Iteratively recalculate until values converge (handles cascading production chains)
 * 4. For each building, calculate production factor based on input fulfillment
 * 5. Scale output by production factor (minimum of all input fulfillment rates)
 * 6. Aggregate to get total production and demand per item
 * 
 * @param layout The base layout with buildings and connections
 * @param buildingsById Map of building definitions by ID
 * @returns Balance data and per-building production states
 */
export function calculateLayoutBalance(
    layout: BaseLayout | undefined,
    buildingsById: BuildingsByIdMap
): LayoutBalanceResult {
    if (!layout || layout.buildings.length === 0) {
        return {
            balances: [],
            buildingStates: new Map(),
        };
    }

    // Build production state for each building
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
        const buildingCount = layoutBuilding.count || 1; // Default to 1 for backwards compatibility
        
        buildingStates.set(layoutBuilding.id, {
            buildingId: layoutBuilding.id,
            outputItemId: recipe.output.id,
            maxOutputRate: recipe.output.amount_per_minute * buildingCount,
            actualOutputRate: hasInputs ? 0 : recipe.output.amount_per_minute * buildingCount, // Extractors produce at 100%
            consumedOutputRate: 0, // Will be calculated after production
            inputRequirements: recipe.inputs.map(input => ({
                itemId: input.id,
                requiredRate: input.amount_per_minute * buildingCount,
                suppliedRate: 0,
            })),
            productionFactor: hasInputs ? 0 : 1, // Extractors start at 100%
        });
    }

    // Group connections by target building
    const incomingConnections = new Map<string, BaseLayoutConnection[]>();
    for (const connection of layout.connections) {
        if (!incomingConnections.has(connection.toBuildingId)) {
            incomingConnections.set(connection.toBuildingId, []);
        }
        incomingConnections.get(connection.toBuildingId)!.push(connection);
    }

    // Iteratively calculate production until values stabilize
    // This handles cascading effects where downstream buildings depend on upstream production
    const MAX_ITERATIONS = 10;
    const CONVERGENCE_THRESHOLD = 0.01; // 1% change tolerance
    
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        let maxChange = 0;

        // For each building, recalculate input supply and production
        for (const [buildingId, state] of buildingStates) {
            if (state.inputRequirements.length === 0) continue; // Skip extractors (they don't change)

            const connections = incomingConnections.get(buildingId) || [];
            
            // Reset supplied rates
            for (const inputReq of state.inputRequirements) {
                inputReq.suppliedRate = 0;
            }
            
            // For each required input, calculate supply from connections
            for (const inputReq of state.inputRequirements) {
                let totalSupplied = 0;

                // Sum up all connections that supply this input item
                for (const connection of connections) {
                    const sourceState = buildingStates.get(connection.fromBuildingId);
                    
                    if (!sourceState) continue;
                    
                    // Verify that:
                    // 1. The connection's itemId matches what we need
                    // 2. The source building's output matches the connection's itemId
                    if (connection.itemId !== inputReq.itemId) continue;
                    if (sourceState.outputItemId !== connection.itemId) continue;

                    // Calculate how much this connection can supply
                    // Limited by: source production, rail capacity
                    const railCapacity = RAIL_CAPACITIES[connection.railTier] || 0;
                    const suppliedByThisConnection = Math.min(
                        sourceState.actualOutputRate,
                        railCapacity
                    );

                    totalSupplied += suppliedByThisConnection;
                }

                // Cap supplied rate at what's actually required
                inputReq.suppliedRate = Math.min(totalSupplied, inputReq.requiredRate);
            }

            // Calculate production factor: minimum fulfillment ratio across all inputs
            let minFulfillmentRatio = 1;
            for (const inputReq of state.inputRequirements) {
                const fulfillmentRatio = inputReq.requiredRate > 0 
                    ? Math.min(1, inputReq.suppliedRate / inputReq.requiredRate)
                    : 1;
                minFulfillmentRatio = Math.min(minFulfillmentRatio, fulfillmentRatio);
            }

            const oldOutputRate = state.actualOutputRate;
            state.productionFactor = minFulfillmentRatio;
            state.actualOutputRate = state.maxOutputRate * minFulfillmentRatio;

            // Track largest change for convergence check
            const change = Math.abs(state.actualOutputRate - oldOutputRate);
            maxChange = Math.max(maxChange, change);
        }

        // If changes are small enough, we've converged
        if (maxChange < CONVERGENCE_THRESHOLD) {
            break;
        }
    }

    // Second pass: Calculate how much of each building's output is actually consumed
    for (const [buildingId, state] of buildingStates) {
        let totalConsumed = 0;
        
        // Find all connections FROM this building
        for (const connection of layout.connections) {
            if (connection.fromBuildingId !== buildingId) continue;
            if (connection.itemId !== state.outputItemId) continue;
            
            // Find the target building and see how much it actually consumes
            const targetState = buildingStates.get(connection.toBuildingId);
            if (!targetState) continue;
            
            // Find the matching input requirement
            const inputReq = targetState.inputRequirements.find(r => r.itemId === connection.itemId);
            if (!inputReq) continue;
            
            // The target building consumes based on its production factor
            const actualConsumption = inputReq.requiredRate * targetState.productionFactor;
            // Limited by rail capacity
            const railCapacity = RAIL_CAPACITIES[connection.railTier] || 0;
            const consumedViaThisConnection = Math.min(actualConsumption, railCapacity, state.actualOutputRate);
            
            totalConsumed += consumedViaThisConnection;
        }
        
        state.consumedOutputRate = Math.min(totalConsumed, state.actualOutputRate);
    }

    // Aggregate production and demand
    const itemProduction = new Map<string, number>();
    const itemDemand = new Map<string, number>();

    for (const state of buildingStates.values()) {
        // Add actual production (scaled by production factor)
        const outputId = state.outputItemId;
        itemProduction.set(outputId, (itemProduction.get(outputId) || 0) + state.actualOutputRate);

        // Add demand for inputs
        for (const inputReq of state.inputRequirements) {
            const demandAmount = inputReq.requiredRate * state.productionFactor; // Only demand what we can use
            itemDemand.set(inputReq.itemId, (itemDemand.get(inputReq.itemId) || 0) + demandAmount);
        }
    }

    // Phase 2: Calculate balance for all items
    const allItemIds = new Set([
        ...itemProduction.keys(),
        ...itemDemand.keys(),
    ]);

    const balances: BaseLayoutBalance[] = [];
    for (const itemId of allItemIds) {
        const production = itemProduction.get(itemId) || 0;
        const demand = itemDemand.get(itemId) || 0;

        // Calculate net balance
        const netBalance = production - demand;

        // Surplus: production exceeds demand
        const surplus = Math.max(0, netBalance);

        // Deficit: demand exceeds production
        const deficit = Math.max(0, -netBalance);

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

/**
 * Gets the rail tier capacity in items per minute
 */
export function getRailCapacity(tier: number): number {
    return RAIL_CAPACITIES[tier] || 0;
}

/**
 * Gets all available rail tiers with their capacities
 */
export function getAvailableRailTiers(): Array<{ tier: number; capacity: number }> {
    return [
        { tier: 1, capacity: 120 },
        { tier: 2, capacity: 240 },
        { tier: 3, capacity: 480 },
    ];
}
