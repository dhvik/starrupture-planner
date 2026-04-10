import { useSubscription, dispatch } from "@flexsurfer/reflex";
import { SUB_IDS } from "../../../../state/sub-ids";
import { EVENT_IDS } from "../../../../state/event-ids";
import type {
  BaseLayoutPointerMode,
  DistributionMode,
  RailTier,
} from "../../../../state/db";

interface ToolsPaletteProps {
  className?: string;
}

const railTierInfo: Array<{
  tier: RailTier;
  name: string;
  capacity: number;
}> = [
  { tier: 1, name: "Tier 1 Rail", capacity: 120 },
  { tier: 2, name: "Tier 2 Rail", capacity: 240 },
  { tier: 3, name: "Tier 3 Rail", capacity: 480 },
];

const ToolsPalette = ({ className }: ToolsPaletteProps) => {
  const pointerMode = useSubscription<BaseLayoutPointerMode>([
    SUB_IDS.BASES_LAYOUT_POINTER_MODE,
  ]);
  const connectorMode = useSubscription<RailTier | null>([
    SUB_IDS.BASES_LAYOUT_CONNECTOR_MODE,
  ]);
  const selectedBuildingIds = useSubscription<string[]>([
    SUB_IDS.BASES_LAYOUT_SELECTED_BUILDING_IDS,
  ]);
  const selectedConnectionIds = useSubscription<string[]>([
    SUB_IDS.BASES_LAYOUT_SELECTED_CONNECTION_IDS,
  ]);
  const selectedBaseId = useSubscription<string | null>([
    SUB_IDS.BASES_SELECTED_BASE_ID,
  ]);

  const handleSelectTool = (tier: RailTier) => {
    if (selectedConnectionIds.length > 0 && selectedBaseId) {
      for (const connectionId of selectedConnectionIds) {
        dispatch([
          EVENT_IDS.BASES_LAYOUT_UPDATE_CONNECTION_TIER,
          selectedBaseId,
          connectionId,
          tier,
        ]);
      }
      return;
    }
    dispatch([EVENT_IDS.BASES_LAYOUT_SET_CONNECTOR_MODE, tier]);
  };

  const handleSetPointerMode = (mode: BaseLayoutPointerMode) => {
    dispatch([EVENT_IDS.BASES_LAYOUT_SET_POINTER_MODE, mode]);
    dispatch([EVENT_IDS.BASES_LAYOUT_SET_CONNECTOR_MODE, null]);
  };

  const handleDeleteSelected = () => {
    if (selectedBuildingIds.length > 0) {
      dispatch([EVENT_IDS.BASES_LAYOUT_DELETE_SELECTED_BUILDING]);
      return;
    }

    if (selectedConnectionIds.length > 0) {
      dispatch([EVENT_IDS.BASES_LAYOUT_DELETE_SELECTED_CONNECTION]);
    }
  };

  const hasSelection =
    selectedBuildingIds.length > 0 || selectedConnectionIds.length > 0;

  const handleSetEditMode = () => {
    if (selectedBaseId) {
      dispatch([
        EVENT_IDS.BASES_LAYOUT_SET_ALL_BUILDINGS_MODE,
        selectedBaseId,
        "edit",
      ]);
    }
  };

  const handleSetSummaryMode = () => {
    if (selectedBaseId) {
      dispatch([
        EVENT_IDS.BASES_LAYOUT_SET_ALL_BUILDINGS_MODE,
        selectedBaseId,
        "summary",
      ]);
    }
  };

  const handleSetDistributionMode = (mode: DistributionMode) => {
    if (selectedBaseId) {
      dispatch([
        EVENT_IDS.BASES_LAYOUT_SET_ALL_BUILDINGS_DISTRIBUTION_MODE,
        selectedBaseId,
        mode,
      ]);
    }
  };

  const toolBtnClass = (isActive: boolean, isDisabled?: boolean) =>
    `btn btn-square btn-sm border-2 transition-all ${
      isActive
        ? "bg-primary/20 border-primary text-primary shadow-md"
        : isDisabled
          ? "border-base-300 opacity-40 cursor-not-allowed"
          : "border-base-300 opacity-70 hover:opacity-100 hover:border-primary/50"
    }`;

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="p-3 flex flex-wrap gap-2">
        {/* Pan Tool */}
        <button
          onClick={() => handleSetPointerMode("pan")}
          className={toolBtnClass(pointerMode === "pan" && !connectorMode)}
          title="Pan — Drag the background to move around"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 11V5a1 1 0 1 1 2 0v5" />
            <path d="M12 11V4a1 1 0 1 1 2 0v7" />
            <path d="M16 11V6a1 1 0 1 1 2 0v8" />
            <path d="M6 12.5V10a1 1 0 1 1 2 0v4" />
            <path d="M18 12v-1a1 1 0 1 1 2 0v4.5c0 1.7-.7 3.4-1.9 4.7L17 21H9.5a3.5 3.5 0 0 1-2.8-1.4l-2.5-3.3a1 1 0 0 1 1.6-1.2L8 17" />
          </svg>
        </button>

        {/* Select Tool */}
        <button
          onClick={() => handleSetPointerMode("select")}
          className={toolBtnClass(pointerMode === "select" && !connectorMode)}
          title="Select — Click items or drag a selection rectangle"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M4 2l12 9.5-5.1 1.2L15.5 22l-3.1 1.3L7.8 14 4 18V2z" />
          </svg>
        </button>

        {/* Rail Tier Tools */}
        {railTierInfo.map(({ tier, name, capacity }) => {
          const isActive = connectorMode === tier;
          const chevrons = ">".repeat(tier);
          return (
            <button
              key={tier}
              onClick={() => handleSelectTool(tier)}
              className={toolBtnClass(isActive)}
              title={
            selectedConnectionIds.length > 0
              ? `Convert selected connection(s) to ${name} (${capacity}/min)`
              : `${name} — ${capacity}/min capacity`
          }
            >
              <span className="text-sm font-bold leading-none">{chevrons}</span>
            </button>
          );
        })}

        {/* Delete Connection Tool */}
        <button
          onClick={handleDeleteSelected}
          disabled={!hasSelection}
          className={toolBtnClass(false, !hasSelection)}
          title={
            selectedBuildingIds.length > 0
              ? "Delete selected buildings"
              : selectedConnectionIds.length > 0
                ? "Delete selected connections"
                : "Select a building or connection first"
          }
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>

        {/* Divider */}
        <div className="w-px h-8 bg-base-300 self-center" />

        {/* Edit Mode Button */}
        <button
          onClick={handleSetEditMode}
          disabled={!selectedBaseId}
          className={toolBtnClass(false, !selectedBaseId)}
          title="Set all buildings to Edit mode"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="m15 5 4 4" />
          </svg>
        </button>

        {/* Summary/Lock Mode Button */}
        <button
          onClick={handleSetSummaryMode}
          disabled={!selectedBaseId}
          className={toolBtnClass(false, !selectedBaseId)}
          title="Set all buildings to Summary mode"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </button>

        {/* Divider */}
        <div className="w-px h-8 bg-base-300 self-center" />

        {/* Distribution: First Served */}
        <button
          onClick={() => handleSetDistributionMode("first-served")}
          disabled={!selectedBaseId}
          className={toolBtnClass(false, !selectedBaseId)}
          title="Set all buildings to First Served distribution — fills connections in order"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="4" y1="6" x2="20" y2="6" />
            <polyline points="14 3 17 6 14 9" />
            <line x1="4" y1="12" x2="14" y2="12" />
            <line x1="4" y1="18" x2="10" y2="18" />
          </svg>
        </button>

        {/* Distribution: Shortest Path */}
        <button
          onClick={() => handleSetDistributionMode("shortest-path")}
          disabled={!selectedBaseId}
          className={toolBtnClass(false, !selectedBaseId)}
          title="Set all buildings to Shortest Path distribution — closest targets are filled first"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="5" cy="12" r="2" />
            <circle cx="19" cy="5" r="2" />
            <circle cx="19" cy="19" r="2" />
            <line x1="7" y1="11" x2="17" y2="6" />
            <line x1="7" y1="13" x2="17" y2="18" />
          </svg>
        </button>

        {/* Distribution: Equal */}
        <button
          onClick={() => handleSetDistributionMode("equal")}
          disabled={!selectedBaseId}
          className={toolBtnClass(false, !selectedBaseId)}
          title="Set all buildings to Equal distribution — output is divided evenly across connections"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="9" x2="19" y2="9" />
            <line x1="5" y1="15" x2="19" y2="15" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ToolsPalette;
