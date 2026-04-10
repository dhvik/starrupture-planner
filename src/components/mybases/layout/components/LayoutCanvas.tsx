import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  ConnectionLineType,
  MarkerType,
  ConnectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useSubscription, dispatch } from "@flexsurfer/reflex";
import { SUB_IDS } from "../../../../state/sub-ids";
import { EVENT_IDS } from "../../../../state/event-ids";
import type {
  BaseLayoutBuilding,
  BaseLayoutConnection,
  Building,
  RailTier,
} from "../../../../state/db";
import type { ConnectionTransferRate } from "../utils/layoutBalanceCalculator";
import { gridToPixels, GRID_CELL_SIZE } from "../utils/gridUtils";
import LayoutBuildingNode from "./LayoutBuildingNode";
import LayoutConnectionEdge from "./LayoutConnectionEdge";

interface LayoutCanvasProps {
  baseId: string;
  className?: string;
}

const nodeTypes = {
  layoutBuilding: LayoutBuildingNode,
};

const edgeTypes = {
  layoutConnection: LayoutConnectionEdge,
};

const LayoutCanvas = ({ baseId, className }: LayoutCanvasProps) => {
  const theme = useSubscription<"light" | "dark">([SUB_IDS.UI_THEME]);
  const buildings = useSubscription<BaseLayoutBuilding[]>([
    SUB_IDS.BASES_LAYOUT_BUILDINGS_BY_BASE_ID,
    baseId,
  ]);
  const connections = useSubscription<BaseLayoutConnection[]>([
    SUB_IDS.BASES_LAYOUT_CONNECTIONS_BY_BASE_ID,
    baseId,
  ]);
  const buildingsById = useSubscription<Record<string, Building>>([
    SUB_IDS.BUILDINGS_BY_ID_MAP,
  ]);
  const connectorMode = useSubscription<RailTier | null>([
    SUB_IDS.BASES_LAYOUT_CONNECTOR_MODE,
  ]);
  const transferRates = useSubscription<Record<string, ConnectionTransferRate>>(
    [SUB_IDS.BASES_LAYOUT_CONNECTION_TRANSFER_RATES, baseId],
  );
  const selectedConnectionId = useSubscription<string | null>([
    SUB_IDS.BASES_LAYOUT_SELECTED_CONNECTION_ID,
  ]);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const hasInitializedView = useRef(false);
  const [connectionDrag, setConnectionDrag] = useState<{
    fromNodeId: string;
  } | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Convert layout buildings to ReactFlow nodes
  useEffect(() => {
    const newNodes: Node[] = buildings.map((building) => {
      const pixelPos = gridToPixels(building.x, building.y);
      const isConnectionSource = connectionDrag?.fromNodeId === building.id;
      return {
        id: building.id,
        type: "layoutBuilding",
        position: pixelPos,
        data: {
          building,
          baseId,
          connectorMode,
          isConnectionSource,
        },
        draggable: !connectorMode, // Disable dragging when in connector mode
        selectable: true,
      };
    });

    setNodes(newNodes);
  }, [buildings, baseId, connectorMode, connectionDrag, setNodes]);

  // Fit view only once on initial load when there are buildings
  useEffect(() => {
    if (!hasInitializedView.current && buildings.length > 0) {
      hasInitializedView.current = true;
      // Small delay to ensure nodes are rendered
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 200 });
      }, 100);
    }
  }, [buildings.length, fitView]);

  // Convert layout connections to ReactFlow edges
  useEffect(() => {
    const newEdges: Edge[] = connections.map((connection) => {
      const rates = transferRates?.[connection.id];
      const isSelected = selectedConnectionId === connection.id;
      return {
        id: connection.id,
        source: connection.fromBuildingId,
        target: connection.toBuildingId,
        type: "layoutConnection",
        data: {
          connection,
          baseId,
          transferRate: rates,
          selected: isSelected,
        },
        style: {
          stroke: "#888",
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
      };
    });
    setEdges(newEdges);
  }, [connections, baseId, transferRates, selectedConnectionId, setEdges]);

  // Handle node drag end - update building position
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!node.data.building) return;

      // Convert pixel position back to grid coordinates
      const gridX = Math.round(node.position.x / GRID_CELL_SIZE);
      const gridY = Math.round(node.position.y / GRID_CELL_SIZE);

      // Dispatch move event
      dispatch([
        EVENT_IDS.BASES_LAYOUT_MOVE_BUILDING,
        baseId,
        node.id,
        gridX,
        gridY,
      ]);
    },
    [baseId],
  );

  // Handle connection creation
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      // Find source building
      const sourceBuilding = buildings.find((b) => b.id === connection.source);
      if (!sourceBuilding) return;

      // Get building definition and recipe
      const buildingDef = buildingsById[sourceBuilding.buildingId];
      if (!buildingDef || !buildingDef.recipes) return;

      const recipe = buildingDef.recipes[sourceBuilding.recipeIndex];
      if (!recipe) return;

      // The item being transferred is the output of the source building
      const itemId = recipe.output.id;

      // Use connector mode rail tier, default to tier 1
      const railTier: RailTier = connectorMode ?? 1;

      // Dispatch add connection event
      dispatch([
        EVENT_IDS.BASES_LAYOUT_ADD_CONNECTION,
        baseId,
        connection.source,
        connection.target,
        itemId,
        railTier,
      ]);

      // Clear connection drag state
      setConnectionDrag(null);
    },
    [baseId, buildings, buildingsById, connectorMode],
  );

  // Handle drop from palette
  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const data = event.dataTransfer.getData("application/reactflow");
      if (!data) return;

      try {
        const { itemId, buildingId, recipeIndex, paletteMode } =
          JSON.parse(data);

        // Convert screen position to flow position
        const flowPosition = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        // Convert flow position to grid coordinates
        const gridX = Math.round(flowPosition.x / GRID_CELL_SIZE);
        const gridY = Math.round(flowPosition.y / GRID_CELL_SIZE);

        // Dispatch add building event based on palette mode
        if (paletteMode === "receiver") {
          dispatch([
            EVENT_IDS.BASES_LAYOUT_ADD_BUILDING,
            baseId,
            gridX,
            gridY,
            itemId,
            "package_receiver",
            0,
            "receiver",
            100,
          ]);
        } else {
          dispatch([
            EVENT_IDS.BASES_LAYOUT_ADD_BUILDING,
            baseId,
            gridX,
            gridY,
            itemId,
            buildingId,
            recipeIndex,
          ]);
        }
      } catch (error) {
        console.error("Failed to parse drag data:", error);
      }
    },
    [baseId, screenToFlowPosition],
  );

  // Allow drop
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  // Handle node click when in connector mode
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!connectorMode) {
        return;
      }

      if (!connectionDrag) {
        // Start connection drag
        setConnectionDrag({ fromNodeId: node.id });
      } else {
        // Complete connection
        if (connectionDrag.fromNodeId !== node.id) {
          handleConnect({
            source: connectionDrag.fromNodeId,
            target: node.id,
            sourceHandle: null,
            targetHandle: null,
          });
        }
        setConnectionDrag(null);
      }
    },
    [connectorMode, connectionDrag, handleConnect],
  );

  // Handle pane click - cancel connection drag and deselect connection
  const handlePaneClick = useCallback(() => {
    if (connectionDrag) {
      setConnectionDrag(null);
    }
    if (selectedConnectionId) {
      dispatch([EVENT_IDS.BASES_LAYOUT_SET_SELECTED_CONNECTION, null]);
    }
  }, [connectionDrag, selectedConnectionId]);

  // Handle edge click - select connection
  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      dispatch([EVENT_IDS.BASES_LAYOUT_SET_SELECTED_CONNECTION, edge.id]);
    },
    [],
  );

  // Handle keyboard events - Delete key removes selected connection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedConnectionId) {
        dispatch([EVENT_IDS.BASES_LAYOUT_DELETE_SELECTED_CONNECTION]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedConnectionId]);

  return (
    <div className={className}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodeTypes={nodeTypes as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        edgeTypes={edgeTypes as any}
        colorMode={theme}
        connectionLineType={ConnectionLineType.Bezier}
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        connectionMode={
          connectorMode ? ConnectionMode.Loose : ConnectionMode.Strict
        }
      >
        <Background gap={GRID_CELL_SIZE} size={2} />
        <Controls />
        <Panel
          position="top-right"
          className="bg-base-200 p-2 rounded-lg shadow-lg text-sm"
        >
          <div className="text-base-content/70" style={{ display: "none" }}>
            <div>Zoom: Scroll wheel</div>
            <div>Pan: Click & drag background</div>
            <div>Move: Drag buildings</div>
            {connectorMode && (
              <div className="mt-2 pt-2 border-t border-base-300">
                <div className="text-primary font-semibold">
                  🔗 Connector Mode: Tier {connectorMode}
                </div>
                <div className="text-xs">
                  {connectionDrag
                    ? "Click on target building"
                    : "Click on source building"}
                </div>
              </div>
            )}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
};

export default LayoutCanvas;
