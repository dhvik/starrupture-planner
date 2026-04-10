import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  SelectionMode,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useStoreApi,
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
  BaseLayoutPointerMode,
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

function areSelectedIdsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((id, index) => id === right[index]);
}

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
  const pointerMode = useSubscription<BaseLayoutPointerMode>([
    SUB_IDS.BASES_LAYOUT_POINTER_MODE,
  ]);
  const connectorMode = useSubscription<RailTier | null>([
    SUB_IDS.BASES_LAYOUT_CONNECTOR_MODE,
  ]);
  const transferRates = useSubscription<Record<string, ConnectionTransferRate>>(
    [SUB_IDS.BASES_LAYOUT_CONNECTION_TRANSFER_RATES, baseId],
  );
  const selectedBuildingIds = useSubscription<string[]>([
    SUB_IDS.BASES_LAYOUT_SELECTED_BUILDING_IDS,
  ]);
  const selectedConnectionIds = useSubscription<string[]>([
    SUB_IDS.BASES_LAYOUT_SELECTED_CONNECTION_IDS,
  ]);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const flowStore = useStoreApi();
  const hasInitializedView = useRef(false);
  const suppressNextNodeClick = useRef(false);
  const suppressNextPaneClick = useRef(false);
  const [connectionDrag, setConnectionDrag] = useState<{
    fromNodeId: string;
  } | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const isPanMode = pointerMode === "pan" && !connectorMode;
  const isSelectMode = pointerMode === "select" && !connectorMode;

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
          selected: selectedBuildingIds.includes(building.id),
        },
        draggable: !connectorMode, // Disable dragging when in connector mode
        selectable: true,
        selected: selectedBuildingIds.includes(building.id),
      };
    });

    setNodes(newNodes);
  }, [
    buildings,
    baseId,
    connectorMode,
    connectionDrag,
    selectedBuildingIds,
    setNodes,
  ]);

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
      const isSelected = selectedConnectionIds.includes(connection.id);
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
  }, [connections, baseId, transferRates, selectedConnectionIds, setEdges]);

  // Handle node drag end - update building position
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!node.data.building) return;

      suppressNextNodeClick.current = true;
      suppressNextPaneClick.current = true;

      if (selectedBuildingIds.length > 1 && selectedBuildingIds.includes(node.id)) {
        return;
      }

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
    [baseId, selectedBuildingIds],
  );

  const handleSelectionDragStop = useCallback(
    (_event: React.MouseEvent, draggedNodes: Node[]) => {
      if (draggedNodes.length === 0) {
        return;
      }

      suppressNextNodeClick.current = true;
      suppressNextPaneClick.current = true;
      flowStore.setState({ nodesSelectionActive: false });

      dispatch([
        EVENT_IDS.BASES_LAYOUT_SET_SELECTION,
        draggedNodes.map((node) => node.id),
        [],
      ]);

      const moves = draggedNodes
        .filter((node) => node.data.building)
        .map((node) => ({
          layoutBuildingId: node.id,
          newX: Math.round(node.position.x / GRID_CELL_SIZE),
          newY: Math.round(node.position.y / GRID_CELL_SIZE),
        }));

      if (moves.length === 0) {
        return;
      }

      if (moves.length === 1) {
        const [move] = moves;
        dispatch([
          EVENT_IDS.BASES_LAYOUT_MOVE_BUILDING,
          baseId,
          move.layoutBuildingId,
          move.newX,
          move.newY,
        ]);
        return;
      }

      dispatch([EVENT_IDS.BASES_LAYOUT_MOVE_BUILDINGS, baseId, moves]);
    },
    [baseId, flowStore],
  );

  // Handle connection creation
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      // Find source building
      const sourceBuilding = buildings.find((b) => b.id === connection.source);
      if (!sourceBuilding) return;

      let itemId: string;

      // Handle package receivers differently - they don't have recipes
      if (sourceBuilding.buildingType === "receiver") {
        itemId = sourceBuilding.itemId;
      } else {
        // Get building definition and recipe for production buildings
        const buildingDef = buildingsById[sourceBuilding.buildingId];
        if (!buildingDef || !buildingDef.recipes) return;

        const recipe = buildingDef.recipes[sourceBuilding.recipeIndex];
        if (!recipe) return;

        // The item being transferred is the output of the source building
        itemId = recipe.output.id;
      }

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
      if (suppressNextNodeClick.current) {
        suppressNextNodeClick.current = false;
        return;
      }

      if (!connectorMode) {
        if (pointerMode !== "select") {
          return;
        }
        dispatch([EVENT_IDS.BASES_LAYOUT_SET_SELECTED_BUILDING, node.id]);
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
    [connectorMode, connectionDrag, handleConnect, pointerMode],
  );

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      if (connectorMode || pointerMode !== "select") {
        return;
      }

      const nextSelectedNodeIds = selectedNodes.map((node) => node.id);
      const nextSelectedEdgeIds = selectedEdges.map((edge) => edge.id);

      flowStore.setState({ nodesSelectionActive: false });

      if (
        areSelectedIdsEqual(nextSelectedNodeIds, selectedBuildingIds) &&
        areSelectedIdsEqual(nextSelectedEdgeIds, selectedConnectionIds)
      ) {
        return;
      }

      dispatch([
        EVENT_IDS.BASES_LAYOUT_SET_SELECTION,
        nextSelectedNodeIds,
        nextSelectedEdgeIds,
      ]);
    },
    [
      connectorMode,
      flowStore,
      pointerMode,
      selectedBuildingIds,
      selectedConnectionIds,
    ],
  );

  // Handle pane click - cancel connection drag and clear selections
  const handlePaneClick = useCallback(() => {
    if (suppressNextPaneClick.current) {
      suppressNextPaneClick.current = false;
      return;
    }

    if (connectionDrag) {
      setConnectionDrag(null);
    }
    if (selectedBuildingIds.length > 0 || selectedConnectionIds.length > 0) {
      dispatch([EVENT_IDS.BASES_LAYOUT_SET_SELECTION, [], []]);
    }
  }, [
    connectionDrag,
    selectedBuildingIds.length,
    selectedConnectionIds.length,
  ]);

  // Handle edge click - select connection
  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      if (pointerMode !== "select") {
        return;
      }
      dispatch([EVENT_IDS.BASES_LAYOUT_SET_SELECTED_CONNECTION, edge.id]);
    },
    [pointerMode],
  );

  // Handle keyboard events - Delete key removes the selected building or connection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete") {
        return;
      }

      if (selectedBuildingIds.length > 0) {
        dispatch([EVENT_IDS.BASES_LAYOUT_DELETE_SELECTED_BUILDING]);
        return;
      }

      if (selectedConnectionIds.length > 0) {
        dispatch([EVENT_IDS.BASES_LAYOUT_DELETE_SELECTED_CONNECTION]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedBuildingIds.length, selectedConnectionIds.length]);

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
        onSelectionChange={handleSelectionChange}
        onSelectionDragStop={handleSelectionDragStop}
        onPaneClick={handlePaneClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodeTypes={nodeTypes as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        edgeTypes={edgeTypes as any}
        colorMode={theme}
        elementsSelectable={isSelectMode}
        connectionLineType={ConnectionLineType.Bezier}
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        panOnDrag={isPanMode}
        selectionOnDrag={isSelectMode}
        selectionMode={SelectionMode.Full}
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
            <div>
              {isPanMode
                ? "Pan: Click & drag background"
                : "Select: Drag the background to box-select"}
            </div>
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
