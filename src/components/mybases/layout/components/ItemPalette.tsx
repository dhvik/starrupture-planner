import { useState, useMemo } from "react";
import { useSubscription, dispatch } from "@flexsurfer/reflex";
import { SUB_IDS } from "../../../../state/sub-ids";
import { EVENT_IDS } from "../../../../state/event-ids";
import type { Item, Building, BaseLayoutBuilding } from "../../../../state/db";
import { ItemImage } from "../../../ui";

interface ItemPaletteProps {
  baseId: string;
  className?: string;
  onDragStart?: (
    itemId: string,
    buildingId: string,
    recipeIndex: number,
  ) => void;
  getViewportCenter?: () => { x: number; y: number };
}

const ItemPalette = ({
  baseId,
  className,
  onDragStart,
  getViewportCenter,
}: ItemPaletteProps) => {
  const [searchTerm, setSearchTerm] = useState("");

  const items = useSubscription<Item[]>([SUB_IDS.ITEMS_LIST]);
  const buildings = useSubscription<Building[]>([SUB_IDS.BUILDINGS_LIST]);
  const layoutBuildings = useSubscription<BaseLayoutBuilding[]>([
    SUB_IDS.BASES_LAYOUT_BUILDINGS_BY_BASE_ID,
    baseId,
  ]);
  const paletteMode = useSubscription<
    "production_v1" | "production_v2" | "receiver"
  >([SUB_IDS.BASES_LAYOUT_ITEM_PALETTE_MODE]);

  // Build the set of v2 building IDs (those pointed to by another building's `upgrade` field)
  const v2BuildingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const building of buildings) {
      if (building.upgrade) ids.add(building.upgrade);
    }
    return ids;
  }, [buildings]);

  // Find all items that can be produced, filtered by palette mode
  const producibleItems = useMemo(() => {
    const result: Array<{
      item: Item;
      building: Building;
      recipeIndex: number;
    }> = [];

    if (paletteMode === "receiver") {
      // Show one entry per unique item (any building that produces it)
      const seen = new Set<string>();
      for (const building of buildings) {
        if (!building.recipes?.length) continue;
        building.recipes.forEach((recipe, index) => {
          if (seen.has(recipe.output.id)) return;
          const item = items.find((i) => i.id === recipe.output.id);
          if (item) {
            seen.add(recipe.output.id);
            result.push({ item, building, recipeIndex: index });
          }
        });
      }
      return result.sort((a, b) => a.item.name.localeCompare(b.item.name));
    }

    const isV2Mode = paletteMode === "production_v2";
    for (const building of buildings) {
      if (!building.recipes?.length) continue;
      const isV2Building = v2BuildingIds.has(building.id);
      if (isV2Mode !== isV2Building) continue;
      building.recipes.forEach((recipe, index) => {
        const item = items.find((i) => i.id === recipe.output.id);
        if (item) result.push({ item, building, recipeIndex: index });
      });
    }
    return result.sort((a, b) => a.item.name.localeCompare(b.item.name));
  }, [items, buildings, paletteMode, v2BuildingIds]);

  // Filter items by search term
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return producibleItems;

    const lowerSearch = searchTerm.toLowerCase();
    return producibleItems.filter(
      ({ item, building }) =>
        item.name.toLowerCase().includes(lowerSearch) ||
        building.name.toLowerCase().includes(lowerSearch),
    );
  }, [producibleItems, searchTerm]);

  const handleAddItem = (
    itemId: string,
    buildingId: string,
    recipeIndex: number,
  ) => {
    // Get the center of the current viewport, or default to (0, 0)
    const centerPoint = getViewportCenter
      ? getViewportCenter()
      : { x: 0, y: 0 };

    // Check if center position is occupied
    const isOccupied = layoutBuildings.some(
      (building) =>
        building.x === centerPoint.x && building.y === centerPoint.y,
    );

    // If occupied, offset by +1 x and +1 y
    const position = isOccupied
      ? { x: centerPoint.x + 1, y: centerPoint.y + 1 }
      : centerPoint;

    if (paletteMode === "receiver") {
      // Add package receiver instead of production building
      dispatch([
        EVENT_IDS.BASES_LAYOUT_ADD_BUILDING,
        baseId,
        position.x,
        position.y,
        itemId,
        "package_receiver", // Use a special building ID for receivers
        0, // recipeIndex not used for receivers
        "receiver", // buildingType
        100, // Default output rate
      ]);
    } else {
      // Normal production building
      dispatch([
        EVENT_IDS.BASES_LAYOUT_ADD_BUILDING,
        baseId,
        position.x,
        position.y,
        itemId,
        buildingId,
        recipeIndex,
      ]);
    }
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header */}
      <div className="border-b border-base-300 flex-shrink-0">
        {/* <h3 className="font-bold mb-2">Item Palette</h3> */}

        {/* Mode selector */}
        <div className="flex gap-2 mb-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="palette-mode"
              className="radio radio-sm radio-primary"
              checked={paletteMode === "production_v1"}
              onChange={() =>
                dispatch([
                  EVENT_IDS.BASES_LAYOUT_SET_ITEM_PALETTE_MODE,
                  "production_v1",
                ])
              }
            />
            <span className="text-sm">Prod v1</span>
          </label>
          {v2BuildingIds.size > 0 && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="palette-mode"
                className="radio radio-sm radio-primary"
                checked={paletteMode === "production_v2"}
                onChange={() =>
                  dispatch([
                    EVENT_IDS.BASES_LAYOUT_SET_ITEM_PALETTE_MODE,
                    "production_v2",
                  ])
                }
              />
              <span className="text-sm">Prod v2</span>
            </label>
          )}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="palette-mode"
              className="radio radio-sm radio-primary"
              checked={paletteMode === "receiver"}
              onChange={() =>
                dispatch([
                  EVENT_IDS.BASES_LAYOUT_SET_ITEM_PALETTE_MODE,
                  "receiver",
                ])
              }
            />
            <span className="text-sm">Receiver</span>
          </label>
        </div>

        <input
          type="text"
          placeholder="Search items..."
          className="input input-sm input-bordered w-full"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto pt-2">
        {filteredItems.length === 0 ? (
          <div className="text-center text-base-content/50 py-8">
            No items found
          </div>
        ) : (
          <div className="space-y-1">
            {filteredItems.map(({ item, building, recipeIndex }) => (
              <button
                key={`${building.id}_${recipeIndex}_${item.id}`}
                draggable
                onDragStart={(e) => {
                  if (onDragStart) {
                    onDragStart(item.id, building.id, recipeIndex);
                  }
                  e.dataTransfer.setData(
                    "application/reactflow",
                    JSON.stringify({
                      itemId: item.id,
                      buildingId: building.id,
                      recipeIndex,
                      paletteMode, // Include the current palette mode
                    }),
                  );
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => handleAddItem(item.id, building.id, recipeIndex)}
                className="w-full btn btn-sm justify-start gap-2 normal-case cursor-move"
              >
                <ItemImage itemId={item.id} size="small" />
                <div className="flex-1 text-left truncate">
                  <div className="text-xs font-semibold truncate">
                    {item.name}
                  </div>
                  <div className="text-xs text-base-content/50 truncate">
                    {paletteMode === "receiver"
                      ? "Package Receiver"
                      : building.name}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemPalette;
