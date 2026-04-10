import { useSubscription, dispatch } from "@flexsurfer/reflex";
import { SUB_IDS } from "../../../../state/sub-ids";
import { EVENT_IDS } from "../../../../state/event-ids";
import type { RailTier } from "../../../../state/db";

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
  const connectorMode = useSubscription<RailTier | null>([
    SUB_IDS.BASES_LAYOUT_CONNECTOR_MODE,
  ]);
  const selectedBuildingId = useSubscription<string | null>([
    SUB_IDS.BASES_LAYOUT_SELECTED_BUILDING_ID,
  ]);
  const selectedConnectionId = useSubscription<string | null>([
    SUB_IDS.BASES_LAYOUT_SELECTED_CONNECTION_ID,
  ]);
  const selectedBaseId = useSubscription<string | null>([
    SUB_IDS.BASES_SELECTED_BASE_ID,
  ]);

  const handleSelectTool = (tier: RailTier | null) => {
    dispatch([EVENT_IDS.BASES_LAYOUT_SET_CONNECTOR_MODE, tier]);
  };

  const handleDeleteSelected = () => {
    if (selectedBuildingId) {
      dispatch([EVENT_IDS.BASES_LAYOUT_DELETE_SELECTED_BUILDING]);
      return;
    }

    if (selectedConnectionId) {
      dispatch([EVENT_IDS.BASES_LAYOUT_DELETE_SELECTED_CONNECTION]);
    }
  };

  const hasSelection = Boolean(selectedBuildingId || selectedConnectionId);

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
        {/* Select Tool */}
        <button
          onClick={() => handleSelectTool(null)}
          className={toolBtnClass(!connectorMode)}
          title="Select — Place & move buildings"
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
              title={`${name} — ${capacity}/min capacity`}
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
            selectedBuildingId
              ? "Delete selected building"
              : selectedConnectionId
                ? "Delete selected connection"
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
      </div>
    </div>
  );
};

export default ToolsPalette;
