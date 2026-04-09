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
  color: string;
}> = [
  {
    tier: 1,
    name: "Tier 1 Rail",
    capacity: 120,
    color: "bg-blue-500/20 hover:bg-blue-500/30 border-blue-500",
  },
  {
    tier: 2,
    name: "Tier 2 Rail",
    capacity: 240,
    color: "bg-green-500/20 hover:bg-green-500/30 border-green-500",
  },
  {
    tier: 3,
    name: "Tier 3 Rail",
    capacity: 480,
    color: "bg-purple-500/20 hover:bg-purple-500/30 border-purple-500",
  },
];

const ConnectorPalette = ({ className }: ConnectorPaletteProps) => {
  const connectorMode = useSubscription<RailTier | null>([
    SUB_IDS.BASES_LAYOUT_CONNECTOR_MODE,
  ]);
  const selectedConnectionId = useSubscription<string | null>([
    SUB_IDS.BASES_LAYOUT_SELECTED_CONNECTION_ID,
  ]);

  const handleSelectTool = (tier: RailTier | null) => {
    dispatch([EVENT_IDS.BASES_LAYOUT_SET_CONNECTOR_MODE, tier]);
  };

  const handleDeleteSelected = () => {
    if (selectedConnectionId) {
      dispatch([EVENT_IDS.BASES_LAYOUT_DELETE_SELECTED_CONNECTION]);
    }
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header */}
      <div
        className={`p-4 border-b border-base-300 flex-shrink-0 transition-colors ${
          connectorMode ? "bg-primary/10 border-primary/30" : ""
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold">Tools</h3>
          {connectorMode && (
            <div className="badge badge-primary badge-lg font-bold animate-pulse">
              TIER {connectorMode} ACTIVE
            </div>
          )}
        </div>
        <p className="text-xs text-base-content/70">
          {connectorMode
            ? `🔗 Click buildings to connect them with Tier ${connectorMode} rail (${railTierInfo.find((t) => t.tier === connectorMode)?.capacity}/min)`
            : "🖱️ Select mode active: Drag buildings from the palette below to place them on the layout"}
        </p>
      </div>

      {/* Tool buttons */}
      <div className="p-4 space-y-2">
        {/* Select Tool - Default */}
        <button
          onClick={() => handleSelectTool(null)}
          className={`w-full btn btn-sm justify-start gap-2 normal-case border-2 transition-all ${
            !connectorMode
              ? "bg-primary/20 !border-primary !border-4 shadow-lg"
              : "border-base-300 border-opacity-50 opacity-70 hover:opacity-100"
          }`}
        >
          <div
            className={`flex items-center justify-center w-8 h-8 rounded ${
              !connectorMode ? "bg-primary text-primary-content" : "bg-base-300"
            }`}
          >
            <span className="text-lg">🖱️</span>
          </div>
          <div className="flex-1 text-left">
            <div
              className={`text-xs font-semibold ${
                !connectorMode ? "text-primary" : ""
              }`}
            >
              Select
            </div>
            <div className="text-xs text-base-content/70">
              Place & move buildings
            </div>
          </div>
          {!connectorMode && (
            <div className="badge badge-primary badge-sm font-bold">
              🖱️ ACTIVE
            </div>
          )}
        </button>

        {/* Connector Tools */}
        {railTierInfo.map(({ tier, name, capacity, color }) => {
          const isActive = connectorMode === tier;
          return (
            <button
              key={tier}
              onClick={() => handleSelectTool(tier)}
              className={`w-full btn btn-sm justify-start gap-2 normal-case border-2 transition-all ${
                isActive
                  ? `${color} !bg-primary/20 !border-primary !border-4 shadow-lg`
                  : `${color} border-opacity-50 opacity-70 hover:opacity-100`
              }`}
            >
              <div
                className={`flex items-center justify-center w-8 h-8 rounded ${
                  isActive ? "bg-primary text-primary-content" : "bg-base-300"
                }`}
              >
                <span className="text-lg font-bold">{tier}</span>
              </div>
              <div className="flex-1 text-left">
                <div
                  className={`text-xs font-semibold ${
                    isActive ? "text-primary" : ""
                  }`}
                >
                  {name}
                </div>
                <div className="text-xs text-base-content/70">
                  {capacity}/min capacity
                </div>
              </div>
              {isActive && (
                <div className="badge badge-primary badge-sm font-bold">
                  🔗 ACTIVE
                </div>
              )}
            </button>
          );
        })}

        {/* Delete Connection Tool */}
        <button
          onClick={handleDeleteSelected}
          disabled={!selectedConnectionId}
          className={`w-full btn btn-sm justify-start gap-2 normal-case border-2 transition-all ${
            selectedConnectionId
              ? "border-error/50 hover:bg-error/20 hover:border-error"
              : "border-base-300 border-opacity-50 opacity-40 cursor-not-allowed"
          }`}
          title={
            selectedConnectionId
              ? "Delete selected connection"
              : "Select a connection first"
          }
        >
          <div
            className={`flex items-center justify-center w-8 h-8 rounded ${
              selectedConnectionId ? "bg-error/20 text-error" : "bg-base-300"
            }`}
          >
            <span className="text-lg">🗑️</span>
          </div>
          <div className="flex-1 text-left">
            <div
              className={`text-xs font-semibold ${
                selectedConnectionId ? "text-error" : ""
              }`}
            >
              Delete Connection
            </div>
            <div className="text-xs text-base-content/70">
              {selectedConnectionId
                ? "Click to remove selected"
                : "Select a connection first"}
            </div>
          </div>
        </button>
      </div>

      {/* Instructions */}
      {connectorMode !== null && (
        <div className="p-4 bg-primary/10 border-t border-primary/30">
          <div className="text-xs space-y-2">
            <p className="font-semibold text-primary flex items-center gap-2">
              <span className="text-lg">🔗</span>
              Connection Mode Active
            </p>
            <ol className="list-decimal list-inside space-y-1 text-base-content/70">
              <li>
                Click on the <strong>source</strong> building (will be
                highlighted)
              </li>
              <li>
                Click on the <strong>target</strong> building to complete
                connection
              </li>
              <li>Repeat to create more connections</li>
            </ol>
            <p className="text-base-content/60 italic pt-1">
              Click empty space to cancel current connection
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectorPalette;
