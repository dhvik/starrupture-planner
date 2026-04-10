import { initAppDb } from "@flexsurfer/reflex";
import {
  buildItemsMap,
  parseCorporations,
  extractCategories,
  type RawCorporationsData,
} from "./data-utils";

// Import versioned data
import itemsDataEarlyAccess from "../data/earlyaccess/items_catalog.json";
import buildingsDataEarlyAccess from "../data/earlyaccess/buildings_and_recipes.json";
import corporationsDataEarlyAccess from "../data/earlyaccess/corporations_components.json";

import itemsDataPlaytest from "../data/playtest/items_catalog.json";
import buildingsDataPlaytest from "../data/playtest/buildings_and_recipes.json";
import corporationsDataPlaytest from "../data/playtest/corporations_components.json";

import itemsDataUpdate1PTB from "../data/update1_PTB/items_catalog.json";
import buildingsDataUpdate1PTB from "../data/update1_PTB/buildings_and_recipes.json";
import corporationsDataUpdate1PTB from "../data/update1_PTB/corporations_components.json";

// Data version types and constants
export type DataVersion = "earlyaccess" | "playtest" | "update1_PTB";

const DATA_VERSIONS: { id: DataVersion; label: string }[] = [
  { id: "earlyaccess", label: "Early Access" },
  { id: "playtest", label: "Playtest" },
  { id: "update1_PTB", label: "Update 1 PTB" },
];

const DEFAULT_DATA_VERSION: DataVersion = "earlyaccess";

// Versioned data maps
const versionedData = {
  earlyaccess: {
    items: itemsDataEarlyAccess,
    buildings: buildingsDataEarlyAccess,
    corporations: corporationsDataEarlyAccess,
  },
  playtest: {
    items: itemsDataPlaytest,
    buildings: buildingsDataPlaytest,
    corporations: corporationsDataPlaytest,
  },
  update1_PTB: {
    items: itemsDataUpdate1PTB,
    buildings: buildingsDataUpdate1PTB,
    corporations: corporationsDataUpdate1PTB,
  },
};

export interface Item {
  id: string;
  name: string;
  type: string;
}

export interface RecipeInput {
  id: string;
  amount_per_minute: number;
}

export interface RecipeOutput {
  id: string;
  amount_per_minute: number;
}

export interface Recipe {
  output: RecipeOutput;
  inputs: RecipeInput[];
}

export interface CoreLevel {
  level: number;
  heatCapacity: number;
}

export interface Building {
  id: string;
  name: string;
  upgrade?: string; // Optional id of upgraded building variant (for example v.2)
  type?: string;
  power?: number;
  heat?: number;
  coreHeatCapacity?: number; // Used by base core amplifiers to increase base heat capacity
  levels?: CoreLevel[]; // Used by base_core building to define heat capacity per level
  recipes?: Recipe[];
}

/** Indexed buildings collection keyed by building id. */
export type BuildingsByIdMap = Record<string, Building>;

export interface Level {
  level: number;
  cost: number;
}

export interface CorporationComponent {
  id: string;
  points: number;
  cost?: number | null;
}

export interface Reward {
  name: string;
}

export interface CorporationLevel {
  level: number;
  xp?: number;
  components: CorporationComponent[];
  rewards: Reward[];
}

export interface Corporation {
  id: string;
  name: string;
  description?: string;
  levels: CorporationLevel[];
}

export type TabType =
  | "items"
  | "recipes"
  | "corporations"
  | "planner"
  | "mybases";

export interface Tab {
  id: TabType;
  label: string;
  icon: string;
}

/** Selected corporation level in planner and production plan forms. */
export interface CorporationLevelSelection {
  corporationId: string;
  level: number;
}

// Base-related types
export interface BaseBuilding {
  id: string;
  buildingTypeId: string; // References Building.id from buildings data
  sectionType: string; // Section where this building was added (e.g., 'inputs', 'production', 'outputs')
  selectedItemId?: string; // Selected item for input buildings
  ratePerMinute?: number; // Rate per minute for the selected item
  name?: string; // Optional custom name for this building instance
  description?: string; // Optional custom description for this building instance
}

/** A single building requirement entry stored on a production plan. */
export interface PlanRequiredBuilding {
  buildingId: string;
  count: number;
}

export interface Production {
  id: string;
  name: string;
  selectedItemId: string;
  targetAmount: number;
  active?: boolean;
  corporationLevel?: CorporationLevelSelection | null;
  recipeSelections?: Record<string, string>; // output item id -> `${buildingId}:${recipeIndex}`
  inputs?: BaseBuilding[]; // Snapshot of BaseBuilding inputs (not linked to base)
  status?: "active" | "inactive" | "error"; // Plan status: active when running, inactive when stopped, error when inputs insufficient
  requiredBuildings?: PlanRequiredBuilding[]; // Aggregated building requirements, populated on save
}

export interface EnergyGroup {
  id: string;
  name: string;
}

// Base Layout types
export type RailTier = 1 | 2 | 3;

export interface BaseLayoutBuilding {
  id: string;
  x: number; // Grid X coordinate
  y: number; // Grid Y coordinate
  itemId: string; // Item being produced
  buildingId: string; // References Building.id
  recipeIndex: number; // Index of recipe in building.recipes array
  count: number; // Number of building instances (1-8), acts as multiplier
}

export interface BaseLayoutConnection {
  id: string;
  fromBuildingId: string; // References BaseLayoutBuilding.id
  toBuildingId: string; // References BaseLayoutBuilding.id
  itemId: string; // Item being transported
  railTier: RailTier; // 1 = 120/min, 2 = 240/min, 3 = 480/min
}

export interface BaseLayout {
  buildings: BaseLayoutBuilding[];
  connections: BaseLayoutConnection[];
  gridOffsetX: number; // Pan offset for viewport
  gridOffsetY: number; // Pan offset for viewport
}

export interface BaseLayoutBalance {
  itemId: string;
  totalProduction: number; // Sum of all production rates on layout
  totalDemand: number; // Sum of all consumption rates on layout
  surplus: number; // Positive when production > demand
  deficit: number; // Positive when demand > production
}

export interface Base {
  id: string;
  name: string;
  coreLevel?: number; // Base Core level (0-4), defaults to 0
  energyGroupId?: string; // References EnergyGroup.id for pooled energy grids
  buildings: BaseBuilding[];
  productions: Production[];
  layout?: BaseLayout; // Optional graphical layout for production planning
}

/** Indexed bases collection keyed by base id. */
export type BasesById = Record<string, Base>;

export interface ConfirmationDialog {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmButtonClass?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export interface CreateProductionPlanModalState {
  isOpen: boolean;
  baseId: string | null;
  editSectionId: string | null;
  // Form state
  name: string;
  selectedItemId: string;
  targetAmount: number;
  selectedCorporationLevel: CorporationLevelSelection | null;
  selectedInputIds: string[];
  recipeSelections: Record<string, string>; // output item id -> `${buildingId}:${recipeIndex}`
  matchInputs: boolean;
}

export interface AppState {
  appDataVersion: DataVersion;
  appDataVersions: { id: DataVersion; label: string }[];
  appVersionedData: Record<
    DataVersion,
    {
      items: Item[];
      buildings: Building[];
      corporations: RawCorporationsData;
    }
  >;
  itemsList: Item[];
  itemsById: Record<string, Item>;
  itemsSelectedCategory: string;
  itemsSelectedBuilding: string;
  itemsSearchTerm: string;
  itemsCategories: string[];
  buildingsList: Building[];
  corporationsList: Corporation[];
  uiTheme: "light" | "dark";
  uiActiveTab: TabType;
  plannerSelectedItemId: string | null;
  plannerSelectedCorporationLevel: CorporationLevelSelection | null;
  plannerRecipeSelections: Record<string, string>; // output item id -> `${buildingId}:${recipeIndex}`
  plannerTargetAmount: number;
  basesList: Base[];
  energyGroups: EnergyGroup[];
  basesSelectedBaseId: string | null;
  baseLayoutConnectorMode: RailTier | null; // Active connector mode for creating connections
  baseLayoutSelectedConnectionId: string | null; // Currently selected connection in layout
  baseLayoutHistory: Record<
    string,
    { undoStack: BaseLayout[]; redoStack: BaseLayout[] }
  >; // Undo/redo history per base
  uiConfirmationDialog: ConfirmationDialog;
  productionPlanModalState: CreateProductionPlanModalState;
}

// Initialize with default version data
const defaultData = versionedData[DEFAULT_DATA_VERSION];
const defaultItems = defaultData.items as Item[];
const defaultBuildings = defaultData.buildings as Building[];
const defaultCorporations = parseCorporations(
  defaultData.corporations as RawCorporationsData,
);

const appState: AppState = {
  //Data
  appDataVersion: DEFAULT_DATA_VERSION,
  appDataVersions: DATA_VERSIONS,
  appVersionedData: versionedData,
  itemsList: defaultItems,
  itemsById: buildItemsMap(defaultItems),
  itemsCategories: extractCategories(defaultItems),
  buildingsList: defaultBuildings,
  corporationsList: defaultCorporations,
  basesList: [],
  energyGroups: [],

  //UI
  uiTheme: "dark",
  uiActiveTab: "items",
  itemsSelectedCategory: "all",
  itemsSelectedBuilding: "all",
  itemsSearchTerm: "",
  plannerSelectedItemId: null,
  plannerSelectedCorporationLevel: null,
  plannerRecipeSelections: {},
  plannerTargetAmount: 60,
  basesSelectedBaseId: null,
  baseLayoutConnectorMode: null,
  baseLayoutSelectedConnectionId: null,
  baseLayoutHistory: {},
  uiConfirmationDialog: {
    isOpen: false,
    title: "",
    message: "",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    confirmButtonClass: "btn-primary",
    onConfirm: () => {},
    onCancel: undefined,
  },
  productionPlanModalState: {
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
  },
};

initAppDb(appState);
