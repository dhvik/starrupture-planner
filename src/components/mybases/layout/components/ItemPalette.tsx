import { useState, useMemo } from 'react';
import { useSubscription, dispatch } from '@flexsurfer/reflex';
import { SUB_IDS } from '../../../../state/sub-ids';
import { EVENT_IDS } from '../../../../state/event-ids';
import type { Item, Building, BaseLayoutBuilding } from '../../../../state/db';
import { ItemImage } from '../../../ui';

interface ItemPaletteProps {
  baseId: string;
  className?: string;
  onDragStart?: (itemId: string, buildingId: string, recipeIndex: number) => void;
  getViewportCenter?: () => { x: number; y: number };
}

const ItemPalette = ({ baseId, className, onDragStart, getViewportCenter }: ItemPaletteProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  const items = useSubscription<Item[]>([SUB_IDS.ITEMS_LIST]);
  const buildings = useSubscription<Building[]>([SUB_IDS.BUILDINGS_LIST]);
  const layoutBuildings = useSubscription<BaseLayoutBuilding[]>([SUB_IDS.BASES_LAYOUT_BUILDINGS_BY_BASE_ID, baseId]);

  // Find all items that can be produced (have a recipe)
  const producibleItems = useMemo(() => {
    const itemsWithRecipes: Array<{ item: Item; building: Building; recipeIndex: number }> = [];

    for (const building of buildings) {
      if (!building.recipes || building.recipes.length === 0) continue;

      building.recipes.forEach((recipe, index) => {
        const item = items.find(i => i.id === recipe.output.id);
        if (item) {
          itemsWithRecipes.push({ item, building, recipeIndex: index });
        }
      });
    }

    return itemsWithRecipes;
  }, [items, buildings]);

  // Filter items by search term
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return producibleItems;

    const lowerSearch = searchTerm.toLowerCase();
    return producibleItems.filter(({ item, building }) =>
      item.name.toLowerCase().includes(lowerSearch) ||
      building.name.toLowerCase().includes(lowerSearch)
    );
  }, [producibleItems, searchTerm]);

  const handleAddItem = (itemId: string, buildingId: string, recipeIndex: number) => {
    // Get the center of the current viewport, or default to (0, 0)
    const centerPoint = getViewportCenter ? getViewportCenter() : { x: 0, y: 0 };
    
    // Check if center position is occupied
    const isOccupied = layoutBuildings.some(
      building => building.x === centerPoint.x && building.y === centerPoint.y
    );
    
    // If occupied, offset by +1 x and +1 y
    const position = isOccupied 
      ? { x: centerPoint.x + 1, y: centerPoint.y + 1 }
      : centerPoint;

    dispatch([
      EVENT_IDS.BASES_LAYOUT_ADD_BUILDING,
      baseId,
      position.x,
      position.y,
      itemId,
      buildingId,
      recipeIndex,
    ]);
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-base-300 flex-shrink-0">
        <h3 className="font-bold mb-2">Item Palette</h3>
        <input
          type="text"
          placeholder="Search items..."
          className="input input-sm input-bordered w-full"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto p-2">
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
                  e.dataTransfer.setData('application/reactflow', JSON.stringify({
                    itemId: item.id,
                    buildingId: building.id,
                    recipeIndex,
                  }));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => handleAddItem(item.id, building.id, recipeIndex)}
                className="w-full btn btn-sm justify-start gap-2 normal-case cursor-move"
              >
                <ItemImage itemId={item.id} size="small" />
                <div className="flex-1 text-left truncate">
                  <div className="text-xs font-semibold truncate">{item.name}</div>
                  <div className="text-xs text-base-content/50 truncate">{building.name}</div>
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
