import { useSubscription, dispatch } from "@flexsurfer/reflex";
import { SUB_IDS } from "../../../../state/sub-ids";
import { EVENT_IDS } from "../../../../state/event-ids";
import type { RailTier } from "../../../../state/db";

interface ConnectorPaletteProps {
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

const ConnectorPalette = ({ className }: ConnectorPaletteProps) => {
  const connectorMode = useSubscription<RailTier | null>([
    SUB_IDS.BASES_LAYOUT_CONNECTOR_MODE,
  ]);
  const selectedConnectionId = useSubscription<string | null>([
    SUB_IDS.BASES_LAYOUT_SELECTED_CONNECTION_ID,
  ]);
  const selectedBaseId = useSubscription<string | null>([
    SUB_IDS.BASES_SELECTED_BASE_ID,
  ]);
  const canUndo = useSubscription<boolean>([SUB_IDS.BASES_LAYOUT_CAN_UNDO]);
  const canRedo = useSubscription<boolean>([SUB_IDS.BASES_LAYOUT_CAN_REDO]);

  const handleSelectTool = (tier: RailTier | null) => {
    dispatch([EVENT_IDS.BASES_LAYOUT_SET_CONNECTOR_MODE, tier]);
  };

  const handleDeleteSelected = () => {
    if (selectedConnectionId) {
      dispatch([EVENT_IDS.BASES_LAYOUT_DELETE_SELECTED_CONNECTION]);
    }
  };

  const handleUndo = () => {
    if (selectedBaseId && canUndo) {
      dispatch([EVENT_IDS.BASES_LAYOUT_UNDO, selectedBaseId]);
    }
  };

  const handleRedo = () => {
    if (selectedBaseId && canRedo) {
      dispatch([EVENT_IDS.BASES_LAYOUT_REDO, selectedBaseId]);
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
          disabled={!selectedConnectionId}
          className={toolBtnClass(false, !selectedConnectionId)}
          title={
            selectedConnectionId
              ? "Delete selected connection"
              : "Select a connection first"
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

        {/* Separator */}
        <div className="w-px bg-base-300 mx-1 self-stretch" />

        {/* Undo */}
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          className={toolBtnClass(false, !canUndo)}
          title="Undo"
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
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </button>

        {/* Redo */}
        <button
          onClick={handleRedo}
          disabled={!canRedo}
          className={toolBtnClass(false, !canRedo)}
          title="Redo"
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
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ConnectorPalette;
