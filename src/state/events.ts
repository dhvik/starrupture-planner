import { regEvent, current } from "@flexsurfer/reflex";
import { EVENT_IDS } from "./event-ids";
import { EFFECT_IDS } from "./effect-ids";
import type {
  TabType,
  DataVersion,
  Item,
  Building,
  AppState,
  Base,
  BaseBuilding,
  BaseLayoutBuilding,
  EnergyGroup,
  Production,
  PlanRequiredBuilding,
  CorporationLevelSelection,
  RailTier,
  LayoutBuildingType,
  DistributionMode,
  TransferMode,
} from "./db";
import {
  buildItemsMap,
  parseCorporations,
  extractCategories,
} from "./data-utils";
import { buildProductionFlow } from "../components/planner/core/productionFlowBuilder";
import type { ProductionFlowResult } from "../components/planner/core/types";
import {
  getSectionTypeForBuilding,
  buildActivePlanOccupancy,
} from "../components/mybases/utils";
import {
  getProductionInputIds,
  getSelectedFlowInputBuildings,
  sanitizeRecipeSelectionsForInputItems,
} from "../utils/productionPlanInputs";
import { resolveLayoutBuildingRecipe } from "../utils/recipeSelection";
import { calculateMaxTargetFromInputs } from "../utils/matchInputsCalculation";

// Common function to update draftDb with version data
function updateDraftDbWithVersionData(draftDb: AppState, version: DataVersion) {
  const data = draftDb.appVersionedData[version];
  const items = data.items as Item[];
  const buildings = data.buildings as Building[];
  const corporations = parseCorporations(data.corporations);

  draftDb.appDataVersion = version;
  draftDb.itemsList = items;
  draftDb.itemsById = buildItemsMap(items);
  draftDb.buildingsList = buildings;
  draftDb.corporationsList = corporations;
  draftDb.itemsCategories = extractCategories(items);
}

function getBaseById(bases: Base[], baseId: string): Base | undefined {
  for (const base of bases) {
    if (base.id === baseId) {
      return base;
    }
  }
  return undefined;
}

function createEntityId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeEnergyGroupName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function areIdsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((id, index) => id === right[index]);
}

function findEnergyGroupByName(
  groups: EnergyGroup[],
  name: string,
): EnergyGroup | undefined {
  const normalizedName = normalizeEnergyGroupName(name).toLowerCase();
  if (!normalizedName) return undefined;

  return groups.find(
    (group) =>
      normalizeEnergyGroupName(group.name).toLowerCase() === normalizedName,
  );
}

/** Recalculates and sets targetAmount when matchInputs is enabled. */
function applyMatchInputs(draftDb: AppState): void {
  if (!draftDb.productionPlanModalState.matchInputs) return;

  const { selectedItemId, selectedInputIds, baseId, selectedCorporationLevel } =
    draftDb.productionPlanModalState;
  if (!selectedItemId || !baseId || !selectedInputIds?.length) return;

  const base = getBaseById(draftDb.basesList, baseId);
  if (!base) return;

  const maxAmount = calculateMaxTargetFromInputs({
    selectedItemId,
    inputBuildings: getSelectedFlowInputBuildings(base, selectedInputIds),
    buildings: draftDb.buildingsList,
    includeLauncher: selectedCorporationLevel !== null,
  });
  if (maxAmount !== null && maxAmount > 0) {
    draftDb.productionPlanModalState.targetAmount = maxAmount;
  }
}

/** Returns a SET_BASES effect tuple that persists bases. */
function persistBasesEffect(draftDb: AppState): [string, Base[]] {
  return [EFFECT_IDS.SET_BASES, current(draftDb.basesList)];
}

/** Returns a SET_ENERGY_GROUPS effect tuple that persists energy groups. */
function persistEnergyGroupsEffect(draftDb: AppState): [string, EnergyGroup[]] {
  return [EFFECT_IDS.SET_ENERGY_GROUPS, current(draftDb.energyGroups)];
}

/** Slowest `amount_per_minute` among all recipes that output `itemId` (matches production-flow default). */
function getSlowestOutputRateForItem(
  buildings: Building[],
  itemId: string,
): number {
  let bestRate: number | null = null;
  for (const building of buildings) {
    for (const recipe of building.recipes || []) {
      if (recipe.output.id === itemId) {
        const rate = recipe.output.amount_per_minute;
        if (bestRate === null || rate < bestRate) {
          bestRate = rate;
        }
      }
    }
  }
  if (bestRate !== null) return bestRate;
  return 60;
}

function setTargetAmountToDefault(draftDb: AppState, itemId: string) {
  draftDb.plannerTargetAmount = getSlowestOutputRateForItem(
    draftDb.buildingsList,
    itemId,
  );
}

/**
 * Aggregates the building requirements from a production flow.
 * Stored on the plan so that subscriptions can check requirements
 * without recomputing the full flow.
 */
function computeRequiredBuildings(
  flow: ProductionFlowResult,
): PlanRequiredBuilding[] {
  const map = new Map<string, PlanRequiredBuilding>();
  flow.nodes.forEach((node) => {
    if (node.nodeType === "input") return;
    const existing = map.get(node.buildingId);
    if (existing) {
      existing.count += Math.ceil(node.buildingCount);
    } else {
      map.set(node.buildingId, {
        buildingId: node.buildingId,
        count: Math.ceil(node.buildingCount),
      });
    }
  });
  return Array.from(map.values());
}

/** Keeps only input snapshots that are actually consumed by the provided flow. */
function computeUsedInputSnapshots(
  flow: ProductionFlowResult,
  inputBuildings: BaseBuilding[] = [],
): BaseBuilding[] {
  const usedInputIdSet = new Set<string>();
  flow.nodes.forEach((node) => {
    if (node.nodeType === "input" && node.baseBuildingId) {
      usedInputIdSet.add(node.baseBuildingId);
    }
  });

  if (usedInputIdSet.size === 0) return [];
  return inputBuildings.filter((inputBuilding) =>
    usedInputIdSet.has(inputBuilding.id),
  );
}

function buildTotalBuildingCountByType(base: Base): Map<string, number> {
  const counts = new Map<string, number>();
  for (const baseBuilding of base.buildings) {
    const count = counts.get(baseBuilding.buildingTypeId) || 0;
    counts.set(baseBuilding.buildingTypeId, count + 1);
  }
  return counts;
}

function buildAvailableBuildingCountByType(
  base: Base,
  excludePlanId?: string | null,
): Map<string, number> {
  const totals = buildTotalBuildingCountByType(base);
  const occupied = buildActivePlanOccupancy(base, {
    excludePlanId,
  }).occupiedBuildingTypeCounts;
  const available = new Map<string, number>();

  totals.forEach((totalCount, buildingTypeId) => {
    const occupiedCount = occupied.get(buildingTypeId) || 0;
    available.set(buildingTypeId, Math.max(0, totalCount - occupiedCount));
  });

  return available;
}

regEvent(EVENT_IDS.UI_SET_THEME, ({ draftDb }, newTheme: "light" | "dark") => {
  draftDb.uiTheme = newTheme;
  return [[EFFECT_IDS.SET_THEME, newTheme]];
});

regEvent(
  EVENT_IDS.UI_SHOW_CONFIRMATION_DIALOG,
  (
    { draftDb },
    title: string,
    message: string,
    onConfirm: () => void,
    options?: {
      confirmLabel?: string;
      cancelLabel?: string;
      confirmButtonClass?: string;
      onCancel?: () => void;
    },
  ) => {
    draftDb.uiConfirmationDialog = {
      isOpen: true,
      title,
      message,
      confirmLabel: options?.confirmLabel || "Confirm",
      cancelLabel: options?.cancelLabel || "Cancel",
      confirmButtonClass: options?.confirmButtonClass || "btn-primary",
      onConfirm,
      onCancel: options?.onCancel,
    };
  },
);

regEvent(EVENT_IDS.UI_CLOSE_CONFIRMATION_DIALOG, ({ draftDb }) => {
  draftDb.uiConfirmationDialog = {};
});

/** Initialization event */
regEvent(
  EVENT_IDS.APP_INIT,
  ({
    draftDb,
    localStoreTheme,
    localStoreDataVersion,
    localStoreBases,
    localStoreEnergyGroups,
  }) => {
    if (localStoreTheme) {
      draftDb.uiTheme = localStoreTheme;
    }

    // Load saved data version if valid
    if (
      localStoreDataVersion &&
      (localStoreDataVersion === "earlyaccess" ||
        localStoreDataVersion === "playtest" ||
        localStoreDataVersion === "update1_PTB")
    ) {
      updateDraftDbWithVersionData(draftDb as AppState, localStoreDataVersion);
    }

    draftDb.basesList = Array.isArray(localStoreBases) ? localStoreBases : [];
    draftDb.energyGroups = Array.isArray(localStoreEnergyGroups)
      ? localStoreEnergyGroups
      : [];

    return [[EFFECT_IDS.SET_THEME, draftDb.uiTheme]];
  },
  [
    [EFFECT_IDS.GET_THEME],
    [EFFECT_IDS.GET_DATA_VERSION],
    [EFFECT_IDS.GET_BASES],
    [EFFECT_IDS.GET_ENERGY_GROUPS],
  ],
);

regEvent(
  EVENT_IDS.ITEMS_SET_SELECTED_CATEGORY,
  ({ draftDb }, category: string) => {
    draftDb.itemsSelectedCategory = category;
  },
);

regEvent(
  EVENT_IDS.ITEMS_SET_SELECTED_BUILDING,
  ({ draftDb }, building: string) => {
    draftDb.itemsSelectedBuilding = building;
  },
);

regEvent(EVENT_IDS.ITEMS_SET_SEARCH_TERM, ({ draftDb }, searchTerm: string) => {
  draftDb.itemsSearchTerm = searchTerm;
});

regEvent(EVENT_IDS.UI_SET_ACTIVE_TAB, ({ draftDb }, newTab: TabType) => {
  draftDb.uiActiveTab = newTab;
});

regEvent(
  EVENT_IDS.PLANNER_OPEN_ITEM,
  (
    { draftDb },
    itemId: string,
    corporationLevel?: CorporationLevelSelection,
  ) => {
    draftDb.plannerSelectedItemId = itemId;
    draftDb.plannerSelectedCorporationLevel = corporationLevel || null;
    draftDb.plannerRecipeSelections = {};
    draftDb.uiActiveTab = "planner";
    setTargetAmountToDefault(draftDb as AppState, itemId);
  },
);

regEvent(
  EVENT_IDS.PLANNER_SET_SELECTED_ITEM,
  ({ draftDb }, itemId: string | null) => {
    draftDb.plannerSelectedItemId = itemId;
    // Reset corporation level when item changes
    draftDb.plannerSelectedCorporationLevel = null;
    draftDb.plannerRecipeSelections = {};
    setTargetAmountToDefault(draftDb as AppState, itemId || "");
  },
);

regEvent(
  EVENT_IDS.PLANNER_SET_SELECTED_CORPORATION_LEVEL,
  ({ draftDb }, corporationLevel: CorporationLevelSelection | null) => {
    draftDb.plannerSelectedCorporationLevel = corporationLevel;
  },
);

regEvent(
  EVENT_IDS.PLANNER_SET_RECIPE_SELECTION,
  ({ draftDb }, itemId: string, recipeKey: string | null) => {
    if (!itemId) return;
    if (!recipeKey) {
      delete draftDb.plannerRecipeSelections[itemId];
      return;
    }
    draftDb.plannerRecipeSelections[itemId] = recipeKey;
  },
);

regEvent(
  EVENT_IDS.APP_SET_DATA_VERSION,
  ({ draftDb }, version: DataVersion) => {
    if (draftDb.appDataVersion === version) return;

    updateDraftDbWithVersionData(draftDb as AppState, version);

    return [[EFFECT_IDS.SET_DATA_VERSION, version]];
  },
);

regEvent(
  EVENT_IDS.PLANNER_SET_TARGET_AMOUNT,
  ({ draftDb }, targetAmount: number) => {
    draftDb.plannerTargetAmount = targetAmount;
  },
);

//===============================================
// Base management
//===============================================

regEvent(EVENT_IDS.BASES_CREATE_BASE, ({ draftDb }, name: string) => {
  const baseId = createEntityId("base");

  const newBase: Base = {
    id: baseId,
    name,
    buildings: [],
    productions: [],
  };

  draftDb.basesList.push(newBase);
  draftDb.basesSelectedBaseId = baseId;

  return [persistBasesEffect(draftDb as AppState)];
});

regEvent(
  EVENT_IDS.BASES_UPDATE_BASE_NAME,
  ({ draftDb }, baseId: string, newName: string) => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (base) {
      base.name = newName;
      return [persistBasesEffect(draftDb as AppState)];
    }
  },
);

regEvent(EVENT_IDS.BASES_SET_CORE_LEVEL, ({ draftDb }, level: number) => {
  const baseId = draftDb.basesSelectedBaseId;
  if (!baseId) return;

  const base = getBaseById(draftDb.basesList, baseId);
  if (base) {
    base.coreLevel = level;
    return [persistBasesEffect(draftDb as AppState)];
  }
});

regEvent(EVENT_IDS.BASES_DELETE_BASE, ({ draftDb }, baseId: string) => {
  draftDb.basesList = draftDb.basesList.filter((b: Base) => b.id !== baseId);
  if (draftDb.basesSelectedBaseId === baseId) {
    draftDb.basesSelectedBaseId = null;
  }
  return [persistBasesEffect(draftDb as AppState)];
});

regEvent(
  EVENT_IDS.BASES_SET_SELECTED_BASE,
  ({ draftDb }, baseId: string | null) => {
    draftDb.basesSelectedBaseId = baseId;
  },
);

/** Creates a new BaseBuilding object with a unique ID. */
function createBaseBuilding(
  buildingTypeId: string,
  sectionType: string,
  name?: string,
  description?: string,
): BaseBuilding {
  return {
    id: createEntityId("building"),
    buildingTypeId,
    sectionType,
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
  };
}

regEvent(
  EVENT_IDS.BASES_ADD_BUILDING,
  (
    { draftDb },
    baseId: string,
    buildingTypeId: string,
    sectionType: string,
    name?: string,
    description?: string,
  ) => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (base) {
      base.buildings.push(
        createBaseBuilding(buildingTypeId, sectionType, name, description),
      );
      return [persistBasesEffect(draftDb as AppState)];
    }
  },
);

regEvent(EVENT_IDS.BASES_REMOVE_BUILDING, ({ draftDb }, buildingId: string) => {
  const baseId = draftDb.basesSelectedBaseId;
  if (!baseId) return;

  const base = getBaseById(draftDb.basesList, baseId);
  if (base) {
    base.buildings = base.buildings.filter(
      (b: BaseBuilding) => b.id !== buildingId,
    );
    return [persistBasesEffect(draftDb as AppState)];
  }
});

regEvent(
  EVENT_IDS.BASES_UPDATE_BUILDING_ITEM_SELECTION,
  (
    { draftDb },
    baseId: string,
    buildingId: string,
    itemId: string | null,
    ratePerMinute: number | null,
  ) => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (base) {
      const building = base.buildings.find(
        (b: BaseBuilding) => b.id === buildingId,
      );
      if (building) {
        if (itemId && ratePerMinute) {
          building.selectedItemId = itemId;
          building.ratePerMinute = ratePerMinute;
        } else {
          building.selectedItemId = undefined;
          building.ratePerMinute = undefined;
        }
        return [persistBasesEffect(draftDb as AppState)];
      }
    }
  },
);

//===============================================
// Energy Groups
//===============================================

regEvent(
  EVENT_IDS.ENERGY_GROUP_CREATE,
  ({ draftDb }, rawName: string, assignBaseId?: string) => {
    const normalizedName = normalizeEnergyGroupName(rawName);
    if (!normalizedName) return;

    const existingGroup = findEnergyGroupByName(
      draftDb.energyGroups,
      normalizedName,
    );
    const targetGroup = existingGroup ?? {
      id: createEntityId("eg"),
      name: normalizedName,
    };

    let changed = false;
    if (!existingGroup) {
      draftDb.energyGroups.push(targetGroup);
      changed = true;
    }

    if (!assignBaseId) {
      return changed
        ? [persistEnergyGroupsEffect(draftDb as AppState)]
        : undefined;
    }

    const base = getBaseById(draftDb.basesList, assignBaseId);
    if (!base) {
      return changed
        ? [persistEnergyGroupsEffect(draftDb as AppState)]
        : undefined;
    }

    if (base.energyGroupId !== targetGroup.id) {
      base.energyGroupId = targetGroup.id;
      changed = true;
    }

    return changed
      ? existingGroup
        ? [persistBasesEffect(draftDb as AppState)]
        : [
            persistBasesEffect(draftDb as AppState),
            persistEnergyGroupsEffect(draftDb as AppState),
          ]
      : undefined;
  },
);

regEvent(EVENT_IDS.ENERGY_GROUP_DELETE, ({ draftDb }, groupId: string) => {
  const hasGroup = draftDb.energyGroups.some(
    (group: EnergyGroup) => group.id === groupId,
  );
  if (!hasGroup) return;

  draftDb.energyGroups = draftDb.energyGroups.filter(
    (g: EnergyGroup) => g.id !== groupId,
  );

  draftDb.basesList.forEach((base: Base) => {
    if (base.energyGroupId === groupId) {
      base.energyGroupId = undefined;
    }
  });

  return [
    persistBasesEffect(draftDb as AppState),
    persistEnergyGroupsEffect(draftDb as AppState),
  ];
});

regEvent(
  EVENT_IDS.ENERGY_GROUP_RENAME,
  ({ draftDb }, groupId: string, rawName: string) => {
    const group = draftDb.energyGroups.find(
      (g: EnergyGroup) => g.id === groupId,
    );
    if (!group) return;

    const normalizedName = normalizeEnergyGroupName(rawName);
    if (!normalizedName) return;

    const duplicateByName = draftDb.energyGroups.find(
      (candidate: EnergyGroup) => {
        return (
          candidate.id !== groupId &&
          normalizeEnergyGroupName(candidate.name).toLowerCase() ===
            normalizedName.toLowerCase()
        );
      },
    );
    if (duplicateByName) return;

    if (group.name === normalizedName) return;
    group.name = normalizedName;
    return [persistEnergyGroupsEffect(draftDb as AppState)];
  },
);

regEvent(
  EVENT_IDS.BASES_SET_ENERGY_GROUP,
  ({ draftDb }, baseId: string, groupId: string | null) => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (!base) return;

    if (!groupId) {
      if (!base.energyGroupId) return;
      base.energyGroupId = undefined;
      return [persistBasesEffect(draftDb as AppState)];
    }

    const groupExists = draftDb.energyGroups.some(
      (group: EnergyGroup) => group.id === groupId,
    );
    if (!groupExists || base.energyGroupId === groupId) return;

    base.energyGroupId = groupId;
    return [persistBasesEffect(draftDb as AppState)];
  },
);

//===============================================
// Base Layout
//===============================================

/** Initialize layout if it doesn't exist */
regEvent(EVENT_IDS.BASES_LAYOUT_INIT, ({ draftDb }, baseId: string) => {
  const base = getBaseById(draftDb.basesList, baseId);
  if (!base) return;

  if (!base.layout) {
    base.layout = {
      buildings: [],
      connections: [],
      gridOffsetX: 0,
      gridOffsetY: 0,
    };
    return [persistBasesEffect(draftDb as AppState)];
  }
});

/** Add a building to the layout */
regEvent(
  EVENT_IDS.BASES_LAYOUT_ADD_BUILDING,
  (
    { draftDb },
    baseId: string,
    x: number,
    y: number,
    itemId: string,
    buildingId: string,
    recipeIndex: number,
    buildingType?: LayoutBuildingType,
    receiverOutputRate?: number,
  ) => {
    console.log("[BASES_LAYOUT_ADD_BUILDING] Event called for baseId:", baseId);
    const base = getBaseById(draftDb.basesList, baseId);
    if (!base) return [];

    // Initialize layout if needed
    if (!base.layout) {
      base.layout = {
        buildings: [],
        connections: [],
        gridOffsetX: 0,
        gridOffsetY: 0,
      };
    }

    // Check if position is already occupied
    const occupied = base.layout.buildings.some((b) => b.x === x && b.y === y);
    if (occupied) {
      console.warn("Position already occupied");
      return [];
    }

    // Treat "package_receiver" buildingId as a receiver even if buildingType
    // was not explicitly passed, so legacy dispatches remain consistent.
    const resolvedBuildingType: LayoutBuildingType | undefined =
      buildingType ??
      (buildingId === "package_receiver" ? "receiver" : undefined);

    const layoutBuilding: BaseLayoutBuilding = {
      id: createEntityId("layout_building"),
      x,
      y,
      itemId,
      buildingId,
      recipeIndex,
      count: 1,
      ...(resolvedBuildingType &&
        resolvedBuildingType !== "production" && {
          buildingType: resolvedBuildingType,
          ...(resolvedBuildingType === "receiver" && {
            receiverOutputRate: receiverOutputRate || 100,
          }),
        }),
    };

    base.layout.buildings.push(layoutBuilding);

    // Create effect with current() to extract immutable value
    return [[EFFECT_IDS.SET_BASES, current(draftDb.basesList)]];
  },
);

/** Remove a building from the layout (and all its connections) */
regEvent(
  EVENT_IDS.BASES_LAYOUT_REMOVE_BUILDING,
  ({ draftDb }, baseId: string, layoutBuildingId: string) => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (!base || !base.layout) return [];

    const removedSelectedConnection = base.layout.connections.some(
      (connection) =>
        connection.id === draftDb.baseLayoutSelectedConnectionId &&
        (connection.fromBuildingId === layoutBuildingId ||
          connection.toBuildingId === layoutBuildingId),
    );

    // Remove the building
    base.layout.buildings = base.layout.buildings.filter(
      (b) => b.id !== layoutBuildingId,
    );

    // Remove all connections involving this building
    base.layout.connections = base.layout.connections.filter(
      (c) =>
        c.fromBuildingId !== layoutBuildingId &&
        c.toBuildingId !== layoutBuildingId,
    );

    if (draftDb.baseLayoutSelectedBuildingId === layoutBuildingId) {
      draftDb.baseLayoutSelectedBuildingId = null;
    }
    draftDb.baseLayoutSelectedBuildingIds =
      draftDb.baseLayoutSelectedBuildingIds.filter(
        (buildingId: string) => buildingId !== layoutBuildingId,
      );

    if (removedSelectedConnection) {
      draftDb.baseLayoutSelectedConnectionId = null;
      draftDb.baseLayoutSelectedConnectionIds = [];
    }

    return [persistBasesEffect(draftDb as AppState)];
  },
);

/** Move a building to a new position */
regEvent(
  EVENT_IDS.BASES_LAYOUT_MOVE_BUILDING,
  (
    { draftDb },
    baseId: string,
    layoutBuildingId: string,
    newX: number,
    newY: number,
  ) => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (!base || !base.layout) return [];

    const building = base.layout.buildings.find(
      (b) => b.id === layoutBuildingId,
    );
    if (!building) return [];

    // Check if new position is occupied by another building
    const occupied = base.layout.buildings.some(
      (b) => b.id !== layoutBuildingId && b.x === newX && b.y === newY,
    );
    if (occupied) {
      console.warn("Position already occupied");
      return [];
    }

    building.x = newX;
    building.y = newY;

    return [persistBasesEffect(draftDb as AppState)];
  },
);

/** Move multiple buildings to new positions atomically */
regEvent(
  EVENT_IDS.BASES_LAYOUT_MOVE_BUILDINGS,
  (
    { draftDb },
    baseId: string,
    moves: Array<{ layoutBuildingId: string; newX: number; newY: number }>,
  ) => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (!base || !base.layout || moves.length === 0) return [];

    const moveIds = new Set(moves.map((move) => move.layoutBuildingId));
    const moveMap = new Map(
      moves.map((move) => [
        move.layoutBuildingId,
        { x: move.newX, y: move.newY },
      ]),
    );

    for (const move of moves) {
      const building = base.layout.buildings.find(
        (candidate) => candidate.id === move.layoutBuildingId,
      );
      if (!building) {
        return [];
      }
    }

    const targetPositions = new Set<string>();
    for (const move of moves) {
      const positionKey = `${move.newX},${move.newY}`;
      if (targetPositions.has(positionKey)) {
        console.warn("Multiple buildings cannot occupy the same position");
        return [];
      }
      targetPositions.add(positionKey);
    }

    const occupiedByOtherBuildings = base.layout.buildings.some((building) => {
      if (moveIds.has(building.id)) {
        return false;
      }

      return targetPositions.has(`${building.x},${building.y}`);
    });

    if (occupiedByOtherBuildings) {
      console.warn("Position already occupied");
      return [];
    }

    base.layout.buildings.forEach((building) => {
      const nextPosition = moveMap.get(building.id);
      if (!nextPosition) {
        return;
      }

      building.x = nextPosition.x;
      building.y = nextPosition.y;
    });

    return [persistBasesEffect(draftDb as AppState)];
  },
);

/** Update building count (1-8) */
regEvent(
  EVENT_IDS.BASES_LAYOUT_UPDATE_BUILDING_COUNT,
  ({ draftDb }, baseId: string, layoutBuildingId: string, count: number) => {
    const baseIndex = draftDb.basesList.findIndex((b: Base) => b.id === baseId);
    if (baseIndex === -1) return [];

    const base = draftDb.basesList[baseIndex];
    if (!base.layout) return [];

    const buildingIndex = base.layout.buildings.findIndex(
      (b: BaseLayoutBuilding) => b.id === layoutBuildingId,
    );
    if (buildingIndex === -1) return [];

    // Clamp count to 1-8
    const newCount = Math.max(1, Math.min(8, Math.round(count)));

    // Use current() to get real values from Immer draft, then create new objects
    const currentBase = current(base);

    const updatedBuildings = currentBase.layout!.buildings.map(
      (b: BaseLayoutBuilding, idx: number) =>
        idx === buildingIndex ? { ...b, count: newCount } : b,
    );

    const updatedLayout = {
      ...currentBase.layout!,
      buildings: updatedBuildings,
    };

    const updatedBase = {
      ...currentBase,
      layout: updatedLayout,
    };

    // Replace the entire basesList array to ensure root subscription detects change
    const newBasesList = [
      ...draftDb.basesList.slice(0, baseIndex),
      updatedBase,
      ...draftDb.basesList.slice(baseIndex + 1),
    ];

    draftDb.basesList = newBasesList;

    return [persistBasesEffect(draftDb as AppState)];
  },
);

/** Update package receiver output rate */
regEvent(
  EVENT_IDS.BASES_LAYOUT_UPDATE_RECEIVER_OUTPUT_RATE,
  (
    { draftDb },
    baseId: string,
    layoutBuildingId: string,
    outputRate: number,
  ) => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (!base || !base.layout) return [];

    const building = base.layout.buildings.find(
      (b) => b.id === layoutBuildingId,
    );
    if (!building || building.buildingType !== "receiver") return [];

    building.receiverOutputRate = Math.max(1, outputRate);

    return [persistBasesEffect(draftDb as AppState)];
  },
);

/** Add a connection between two buildings */
regEvent(
  EVENT_IDS.BASES_LAYOUT_ADD_CONNECTION,
  (
    { draftDb },
    baseId: string,
    fromBuildingId: string,
    toBuildingId: string,
    itemId: string,
    railTier: 1 | 2 | 3,
  ) => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (!base || !base.layout) return;

    if (fromBuildingId === toBuildingId) {
      console.warn("Cannot connect a building to itself");
      return;
    }

    const sourceBuilding = base.layout.buildings.find(
      (building) => building.id === fromBuildingId,
    );
    const targetBuilding = base.layout.buildings.find(
      (building) => building.id === toBuildingId,
    );

    if (!sourceBuilding || !targetBuilding) {
      console.warn("Connection endpoints not found");
      return;
    }

    const buildingsById = new Map<string, Building>(
      draftDb.buildingsList.map((building: Building) => [
        building.id,
        building,
      ]),
    );
    const sourceBuildingDef = buildingsById.get(sourceBuilding.buildingId);
    const targetBuildingDef = buildingsById.get(targetBuilding.buildingId);

    if (!sourceBuildingDef || !targetBuildingDef) {
      console.warn("Connection building definitions not found");
      return;
    }

    if (sourceBuilding.buildingType === "receiver") {
      if (sourceBuilding.itemId !== itemId) {
        console.warn("Receiver does not output the requested item");
        return;
      }
    } else {
      const sourceRecipe = resolveLayoutBuildingRecipe(
        sourceBuilding,
        sourceBuildingDef,
      );
      if (!sourceRecipe || sourceRecipe.output.id !== itemId) {
        console.warn("Source building does not output the requested item");
        return;
      }
    }

    const targetRecipe = resolveLayoutBuildingRecipe(
      targetBuilding,
      targetBuildingDef,
    );
    const targetAcceptsItem = targetRecipe?.inputs.some(
      (input: { id: string }) => input.id === itemId,
    );

    if (!targetAcceptsItem) {
      console.warn("Target building does not accept the requested item");
      return;
    }

    // Check if connection already exists
    const exists = base.layout.connections.some(
      (c) =>
        c.fromBuildingId === fromBuildingId &&
        c.toBuildingId === toBuildingId &&
        c.itemId === itemId,
    );

    if (exists) {
      console.warn("Connection already exists");
      return;
    }

    const connection = {
      id: createEntityId("layout_connection"),
      fromBuildingId,
      toBuildingId,
      itemId,
      railTier,
    };

    base.layout.connections.push(connection);
    return [persistBasesEffect(draftDb as AppState)];
  },
);

/** Remove a connection */
regEvent(
  EVENT_IDS.BASES_LAYOUT_REMOVE_CONNECTION,
  ({ draftDb }, baseId: string, connectionId: string) => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (!base || !base.layout) return;

    base.layout.connections = base.layout.connections.filter(
      (c) => c.id !== connectionId,
    );
    draftDb.baseLayoutSelectedConnectionIds =
      draftDb.baseLayoutSelectedConnectionIds.filter(
        (selectedId: string) => selectedId !== connectionId,
      );
    if (draftDb.baseLayoutSelectedConnectionId === connectionId) {
      draftDb.baseLayoutSelectedConnectionId = null;
    }
    return [persistBasesEffect(draftDb as AppState)];
  },
);

/** Update the rail tier of a connection */
regEvent(
  EVENT_IDS.BASES_LAYOUT_UPDATE_CONNECTION_TIER,
  ({ draftDb }, baseId: string, connectionId: string, railTier: 1 | 2 | 3) => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (!base || !base.layout) return;

    const connection = base.layout.connections.find(
      (c) => c.id === connectionId,
    );
    if (!connection) return;

    connection.railTier = railTier;
    return [persistBasesEffect(draftDb as AppState)];
  },
);

/** Set the grid offset (pan position) */
regEvent(
  EVENT_IDS.BASES_LAYOUT_SET_GRID_OFFSET,
  ({ draftDb }, baseId: string, offsetX: number, offsetY: number) => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (!base || !base.layout) return;

    base.layout.gridOffsetX = offsetX;
    base.layout.gridOffsetY = offsetY;

    return [persistBasesEffect(draftDb as AppState)];
  },
);

/** Set the active pointer mode for the layout canvas */
regEvent(
  EVENT_IDS.BASES_LAYOUT_SET_POINTER_MODE,
  ({ draftDb }, mode: "select" | "pan") => {
    draftDb.baseLayoutPointerMode = mode;
  },
);

/** Set connector mode for creating connections */
regEvent(
  EVENT_IDS.BASES_LAYOUT_SET_CONNECTOR_MODE,
  ({ draftDb }, railTier: RailTier | null) => {
    draftDb.baseLayoutConnectorMode = railTier;
  },
);

/** Toggle between physical and virtual transfer mode */
regEvent(
  EVENT_IDS.BASES_LAYOUT_SET_TRANSFER_MODE,
  ({ draftDb }, mode: TransferMode) => {
    draftDb.baseLayoutTransferMode = mode;
    // Clear any in-progress connector drag when entering virtual mode
    if (mode === "virtual") {
      draftDb.baseLayoutConnectorMode = null;
    }
  },
);

/** Persist the user's preferred rail tier for new connections */
regEvent(
  EVENT_IDS.BASES_LAYOUT_SET_SELECTED_RAIL_TIER,
  ({ draftDb }, railTier: RailTier) => {
    draftDb.baseLayoutSelectedRailTier = railTier;
  },
);

/** Set item palette mode (production_v1, production_v2, or receiver) */
regEvent(
  EVENT_IDS.BASES_LAYOUT_SET_ITEM_PALETTE_MODE,
  ({ draftDb }, mode: "production_v1" | "production_v2" | "receiver") => {
    draftDb.baseLayoutItemPaletteMode = mode;
  },
);

/** Set selected connection in layout */
regEvent(
  EVENT_IDS.BASES_LAYOUT_SET_SELECTION,
  ({ draftDb }, buildingIds: string[] = [], connectionIds: string[] = []) => {
    const nextSelectedBuildingId =
      buildingIds.length === 1 && connectionIds.length === 0
        ? buildingIds[0]
        : null;
    const nextSelectedConnectionId =
      connectionIds.length === 1 && buildingIds.length === 0
        ? connectionIds[0]
        : null;

    if (
      areIdsEqual(draftDb.baseLayoutSelectedBuildingIds, buildingIds) &&
      areIdsEqual(draftDb.baseLayoutSelectedConnectionIds, connectionIds) &&
      draftDb.baseLayoutSelectedBuildingId === nextSelectedBuildingId &&
      draftDb.baseLayoutSelectedConnectionId === nextSelectedConnectionId
    ) {
      return;
    }

    draftDb.baseLayoutSelectedBuildingIds = buildingIds;
    draftDb.baseLayoutSelectedConnectionIds = connectionIds;
    draftDb.baseLayoutSelectedBuildingId = nextSelectedBuildingId;
    draftDb.baseLayoutSelectedConnectionId = nextSelectedConnectionId;
  },
);

/** Set selected building in layout */
regEvent(
  EVENT_IDS.BASES_LAYOUT_SET_SELECTED_BUILDING,
  ({ draftDb }, buildingId: string | null) => {
    if (
      draftDb.baseLayoutSelectedBuildingId === buildingId &&
      areIdsEqual(
        draftDb.baseLayoutSelectedBuildingIds,
        buildingId ? [buildingId] : [],
      ) &&
      draftDb.baseLayoutSelectedConnectionIds.length === 0 &&
      draftDb.baseLayoutSelectedConnectionId === null
    ) {
      return;
    }

    draftDb.baseLayoutSelectedBuildingIds = buildingId ? [buildingId] : [];
    draftDb.baseLayoutSelectedBuildingId = buildingId;
    draftDb.baseLayoutSelectedConnectionIds = [];
    draftDb.baseLayoutSelectedConnectionId = null;
  },
);

/** Delete the currently selected building */
regEvent(EVENT_IDS.BASES_LAYOUT_DELETE_SELECTED_BUILDING, ({ draftDb }) => {
  const buildingIds = draftDb.baseLayoutSelectedBuildingIds.length
    ? draftDb.baseLayoutSelectedBuildingIds
    : draftDb.baseLayoutSelectedBuildingId
      ? [draftDb.baseLayoutSelectedBuildingId]
      : [];
  if (buildingIds.length === 0) return;

  const selectedBaseId = draftDb.basesSelectedBaseId;
  if (!selectedBaseId) return;

  const base = getBaseById(draftDb.basesList, selectedBaseId);
  if (!base || !base.layout) return;

  const selectedBuildingIds = new Set(buildingIds);

  const removedSelectedConnection = base.layout.connections.some(
    (connection) =>
      draftDb.baseLayoutSelectedConnectionIds.includes(connection.id) ||
      (connection.id === draftDb.baseLayoutSelectedConnectionId &&
        (selectedBuildingIds.has(connection.fromBuildingId) ||
          selectedBuildingIds.has(connection.toBuildingId))),
  );

  base.layout.buildings = base.layout.buildings.filter(
    (building) => !selectedBuildingIds.has(building.id),
  );
  base.layout.connections = base.layout.connections.filter(
    (connection) =>
      !selectedBuildingIds.has(connection.fromBuildingId) &&
      !selectedBuildingIds.has(connection.toBuildingId),
  );

  draftDb.baseLayoutSelectedBuildingIds = [];
  draftDb.baseLayoutSelectedBuildingId = null;
  if (removedSelectedConnection) {
    draftDb.baseLayoutSelectedConnectionIds = [];
    draftDb.baseLayoutSelectedConnectionId = null;
  }

  return [persistBasesEffect(draftDb as AppState)];
});

/** Set selected connection in layout */
regEvent(
  EVENT_IDS.BASES_LAYOUT_SET_SELECTED_CONNECTION,
  ({ draftDb }, connectionId: string | null) => {
    if (
      draftDb.baseLayoutSelectedConnectionId === connectionId &&
      areIdsEqual(
        draftDb.baseLayoutSelectedConnectionIds,
        connectionId ? [connectionId] : [],
      ) &&
      draftDb.baseLayoutSelectedBuildingIds.length === 0 &&
      draftDb.baseLayoutSelectedBuildingId === null
    ) {
      return;
    }

    draftDb.baseLayoutSelectedBuildingIds = [];
    draftDb.baseLayoutSelectedBuildingId = null;
    draftDb.baseLayoutSelectedConnectionIds = connectionId
      ? [connectionId]
      : [];
    draftDb.baseLayoutSelectedConnectionId = connectionId;
  },
);

/** Delete the currently selected connection */
regEvent(EVENT_IDS.BASES_LAYOUT_DELETE_SELECTED_CONNECTION, ({ draftDb }) => {
  const connectionIds = draftDb.baseLayoutSelectedConnectionIds.length
    ? draftDb.baseLayoutSelectedConnectionIds
    : draftDb.baseLayoutSelectedConnectionId
      ? [draftDb.baseLayoutSelectedConnectionId]
      : [];
  if (connectionIds.length === 0) return;

  const selectedBaseId = draftDb.basesSelectedBaseId;
  if (!selectedBaseId) return;

  const base = getBaseById(draftDb.basesList, selectedBaseId);
  if (!base || !base.layout) return;

  const selectedConnectionIds = new Set(connectionIds);

  base.layout.connections = base.layout.connections.filter(
    (connection) => !selectedConnectionIds.has(connection.id),
  );
  draftDb.baseLayoutSelectedConnectionIds = [];
  draftDb.baseLayoutSelectedConnectionId = null;
  return [persistBasesEffect(draftDb as AppState)];
});

/** Toggle building mode between edit and summary */
regEvent(
  EVENT_IDS.BASES_LAYOUT_TOGGLE_BUILDING_MODE,
  ({ draftDb }, baseId: string, layoutBuildingId: string) => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (!base || !base.layout) return [];

    const building = base.layout.buildings.find(
      (b) => b.id === layoutBuildingId,
    );
    if (!building) return [];

    // Toggle mode: edit ↔ summary (undefined defaults to "edit")
    const currentMode = building.mode || "edit";
    building.mode = currentMode === "edit" ? "summary" : "edit";

    return [persistBasesEffect(draftDb as AppState)];
  },
);

/** Set all buildings in a layout to a specific mode */
regEvent(
  EVENT_IDS.BASES_LAYOUT_SET_ALL_BUILDINGS_MODE,
  ({ draftDb }, baseId: string, mode: "edit" | "summary") => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (!base || !base.layout) return [];

    // Set mode for all buildings in the layout
    base.layout.buildings.forEach((building) => {
      building.mode = mode;
    });

    return [persistBasesEffect(draftDb as AppState)];
  },
);

/** Set the output distribution mode for all buildings in a layout */
regEvent(
  EVENT_IDS.BASES_LAYOUT_SET_ALL_BUILDINGS_DISTRIBUTION_MODE,
  ({ draftDb }, baseId: string, mode: DistributionMode) => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (!base || !base.layout) return [];

    base.layout.buildings.forEach((building) => {
      building.distributionMode = mode;
    });

    return [persistBasesEffect(draftDb as AppState)];
  },
);

//===============================================
//  PRODUCTION PLAN SECTIONS
//===============================================

/** Production Plan Section events */

regEvent(
  EVENT_IDS.PRODUCTION_PLAN_ACTIVATE_SECTION,
  ({ draftDb }, baseId: string, sectionId: string) => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (!base) return;

    const section = base.productions.find(
      (s: Production) => s.id === sectionId,
    );
    if (!section) return;

    section.active = true;
    section.status = "active";

    return [persistBasesEffect(draftDb as AppState)];
  },
);

regEvent(
  EVENT_IDS.PRODUCTION_PLAN_DEACTIVATE_SECTION,
  ({ draftDb }, baseId: string, sectionId: string) => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (base) {
      const section = base.productions.find(
        (s: Production) => s.id === sectionId,
      );
      if (section) {
        section.active = false;
        section.status = "inactive";
        return [persistBasesEffect(draftDb as AppState)];
      }
    }
  },
);

regEvent(
  EVENT_IDS.PRODUCTION_PLAN_DELETE_SECTION,
  ({ draftDb }, baseId: string, sectionId: string) => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (base) {
      base.productions = base.productions.filter(
        (s: Production) => s.id !== sectionId,
      );
      return [persistBasesEffect(draftDb as AppState)];
    }
  },
);

regEvent(
  EVENT_IDS.PRODUCTION_PLAN_ADD_BUILDINGS_TO_BASE,
  ({ draftDb }, baseId: string, planId: string, flag: "all" | "missing") => {
    const base = getBaseById(draftDb.basesList, baseId);
    if (!base) return;

    const plan = base.productions.find((s: Production) => s.id === planId);
    if (!plan) return;

    const requiredBuildings = plan.requiredBuildings || [];
    if (requiredBuildings.length === 0) return;

    const existingCountByType =
      flag === "missing"
        ? buildAvailableBuildingCountByType(base, plan.id)
        : new Map<string, number>();

    const buildingCountsToAdd: PlanRequiredBuilding[] = [];

    for (const { buildingId, count: requiredCount } of requiredBuildings) {
      if (requiredCount <= 0) continue;

      const existingCount =
        flag === "missing" ? existingCountByType.get(buildingId) || 0 : 0;
      const countToAdd =
        flag === "missing"
          ? Math.max(0, requiredCount - existingCount)
          : requiredCount;
      if (countToAdd === 0) continue;

      buildingCountsToAdd.push({ buildingId, count: countToAdd });
      existingCountByType.set(buildingId, existingCount + countToAdd);
    }

    if (buildingCountsToAdd.length === 0) return;

    // Build a lookup for building type data only when additions are needed.
    const buildingsById = new Map(
      (draftDb.buildingsList as Building[]).map((b: Building) => [b.id, b]),
    );
    const resolveSectionType = (buildingId: string): string => {
      const building = buildingsById.get(buildingId);
      return building ? getSectionTypeForBuilding(building) : "production";
    };

    const newBuildings: BaseBuilding[] = [];
    const createPlanBuilding = (
      buildingId: string,
      sectionType: string,
    ): BaseBuilding => {
      const newBuilding = createBaseBuilding(buildingId, sectionType);
      if (buildingId === "orbital_cargo_launcher" && plan.selectedItemId) {
        newBuilding.selectedItemId = plan.selectedItemId;
        newBuilding.ratePerMinute = 10;
      }
      return newBuilding;
    };
    for (const { buildingId, count } of buildingCountsToAdd) {
      const sectionType = resolveSectionType(buildingId);
      for (let i = 0; i < count; i++) {
        newBuildings.push(createPlanBuilding(buildingId, sectionType));
      }
    }

    base.buildings.push(...newBuildings);

    return [persistBasesEffect(draftDb as AppState)];
  },
);

/** Create Production Plan Modal events */

regEvent(
  EVENT_IDS.PRODUCTION_PLAN_MODAL_OPEN,
  ({ draftDb }, editSectionId?: string | null) => {
    const baseId = draftDb.basesSelectedBaseId;
    if (!baseId) return; // No selected base, cannot open modal

    const base = getBaseById(draftDb.basesList, baseId);
    if (!base) return; // Base not found

    const editSection = base.productions?.find(
      (p: Production) => p.id === editSectionId,
    );

    // Initialize form state from edit section or defaults
    if (editSection) {
      draftDb.productionPlanModalState = {
        isOpen: true,
        baseId,
        editSectionId: editSectionId || null,
        name: editSection.name,
        selectedItemId: editSection.selectedItemId,
        targetAmount: editSection.targetAmount,
        selectedCorporationLevel: editSection.corporationLevel || null,
        selectedInputIds: getProductionInputIds(editSection.inputs),
        recipeSelections: { ...(editSection.recipeSelections || {}) },
        matchInputs: false,
      };
    } else {
      draftDb.productionPlanModalState = {
        isOpen: true,
        baseId,
        editSectionId: null,
        name: "",
        selectedItemId: "",
        targetAmount: 60,
        selectedCorporationLevel: null,
        selectedInputIds: [],
        recipeSelections: {},
        matchInputs: false,
      };
    }
  },
);

regEvent(EVENT_IDS.PRODUCTION_PLAN_MODAL_CLOSE, ({ draftDb }) => {
  draftDb.productionPlanModalState = {
    isOpen: false,
    baseId: null,
    editSectionId: null,
    name: "",
    selectedItemId: "",
    targetAmount: 60,
    selectedCorporationLevel: null,
    selectedInputIds: [],
    recipeSelections: {},
    matchInputs: false,
  };
});

regEvent(EVENT_IDS.PRODUCTION_PLAN_MODAL_SUBMIT, ({ draftDb }) => {
  const modal = draftDb.productionPlanModalState;
  const {
    baseId,
    editSectionId,
    name,
    selectedItemId,
    targetAmount,
    selectedCorporationLevel,
  } = modal;

  if (!baseId || !name.trim() || !selectedItemId || targetAmount <= 0) {
    return;
  }

  const base = getBaseById(draftDb.basesList, baseId);
  if (!base) return;

  // Get production flow to extract used inputs
  const validAmount = targetAmount > 0 ? targetAmount : 1;
  const includeLauncher = selectedCorporationLevel !== null;
  const selectedInputBuildings = getSelectedFlowInputBuildings(
    base,
    modal.selectedInputIds || [],
  );
  const recipeSelections = sanitizeRecipeSelectionsForInputItems(
    modal.recipeSelections,
    selectedInputBuildings,
  );

  const flow = buildProductionFlow(
    {
      targetItemId: selectedItemId,
      targetAmount: validAmount,
      inputBuildings: selectedInputBuildings,
      rawProductionDisabled: true,
      includeLauncher,
      recipeSelections,
    },
    draftDb.buildingsList,
  );

  const usedInputSnapshots = computeUsedInputSnapshots(
    flow,
    selectedInputBuildings,
  ).map((input) => ({ ...input }));

  const requiredBuildings = computeRequiredBuildings(flow);

  if (editSectionId) {
    // Update existing section
    const section = base.productions.find(
      (s: Production) => s.id === editSectionId,
    );
    if (section) {
      section.name = name.trim();
      section.selectedItemId = selectedItemId;
      section.targetAmount = targetAmount;
      section.corporationLevel = selectedCorporationLevel;
      section.inputs = usedInputSnapshots;
      section.requiredBuildings = requiredBuildings;
      section.recipeSelections = { ...recipeSelections };
    }
  } else {
    // Create new section
    const sectionId = createEntityId("pps");
    const newSection: Production = {
      id: sectionId,
      name: name.trim(),
      selectedItemId,
      targetAmount,
      active: false,
      corporationLevel: selectedCorporationLevel,
      inputs: usedInputSnapshots,
      status: "inactive",
      requiredBuildings,
      recipeSelections: { ...recipeSelections },
    };
    base.productions.push(newSection);
  }

  return [persistBasesEffect(draftDb as AppState)];
});

/** Production Plan Modal Form events */

regEvent(
  EVENT_IDS.PRODUCTION_PLAN_MODAL_SET_NAME,
  ({ draftDb }, name: string) => {
    draftDb.productionPlanModalState.name = name;
  },
);

regEvent(
  EVENT_IDS.PRODUCTION_PLAN_MODAL_SET_SELECTED_ITEM,
  ({ draftDb }, itemId: string) => {
    draftDb.productionPlanModalState.selectedItemId = itemId;
    draftDb.productionPlanModalState.selectedCorporationLevel = null;
    draftDb.productionPlanModalState.recipeSelections = {};

    if (itemId) {
      draftDb.productionPlanModalState.targetAmount =
        getSlowestOutputRateForItem(draftDb.buildingsList, itemId);
      applyMatchInputs(draftDb as AppState);
    }
  },
);

regEvent(
  EVENT_IDS.PRODUCTION_PLAN_MODAL_SET_RECIPE_SELECTION,
  ({ draftDb }, itemId: string, recipeKey: string | null) => {
    if (!itemId) return;

    const modalState = draftDb.productionPlanModalState;
    const base = modalState.baseId
      ? getBaseById(draftDb.basesList, modalState.baseId)
      : undefined;
    const selectedInputBuildings = getSelectedFlowInputBuildings(
      base,
      modalState.selectedInputIds || [],
    );
    const inputItemIds = new Set(
      selectedInputBuildings
        .map((input) => input.selectedItemId)
        .filter((id): id is string => !!id),
    );
    if (inputItemIds.has(itemId)) return;

    if (!recipeKey) {
      delete modalState.recipeSelections[itemId];
    } else {
      modalState.recipeSelections[itemId] = recipeKey;
    }
    applyMatchInputs(draftDb as AppState);
  },
);

regEvent(
  EVENT_IDS.PRODUCTION_PLAN_MODAL_SET_TARGET_AMOUNT,
  ({ draftDb }, amount: number) => {
    if (draftDb.productionPlanModalState.matchInputs) return;
    draftDb.productionPlanModalState.targetAmount = amount;
  },
);

regEvent(
  EVENT_IDS.PRODUCTION_PLAN_MODAL_SET_MATCH_INPUTS,
  ({ draftDb }, enabled: boolean) => {
    draftDb.productionPlanModalState.matchInputs = enabled;
    if (enabled) {
      applyMatchInputs(draftDb as AppState);
    }
  },
);

regEvent(
  EVENT_IDS.PRODUCTION_PLAN_MODAL_SET_SELECTED_CORPORATION_LEVEL,
  ({ draftDb }, level: CorporationLevelSelection | null) => {
    draftDb.productionPlanModalState.selectedCorporationLevel = level;
  },
);

regEvent(
  EVENT_IDS.PRODUCTION_PLAN_MODAL_TOGGLE_INPUT,
  ({ draftDb }, baseBuildingId: string) => {
    const modalState = draftDb.productionPlanModalState;
    const selectedInputIds = modalState.selectedInputIds;
    const index = selectedInputIds.indexOf(baseBuildingId);
    if (index >= 0) {
      selectedInputIds.splice(index, 1);
    } else {
      selectedInputIds.push(baseBuildingId);
    }
    const base = modalState.baseId
      ? getBaseById(draftDb.basesList, modalState.baseId)
      : undefined;
    const selectedInputBuildings = getSelectedFlowInputBuildings(
      base,
      selectedInputIds || [],
    );
    const sanitizedRecipeSelections = sanitizeRecipeSelectionsForInputItems(
      modalState.recipeSelections,
      selectedInputBuildings,
    );
    modalState.recipeSelections = sanitizedRecipeSelections;
    applyMatchInputs(draftDb as AppState);
  },
);
