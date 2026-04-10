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
import { validateConnection } from "../utils/connectionValidator";
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

interface ConnectionDragState {
  fromNodeId: string;
  itemId: string;
  validTargetIds: string[];
}

function getClientPositionFromPointerEvent(
  event: MouseEvent | TouchEvent,
): { clientX: number; clientY: number } | null {
  if ("changedTouches" in event && event.changedTouches.length > 0) {
    const touch = event.changedTouches[0];
    return {
      clientX: touch.clientX,
      clientY: touch.clientY,
    };
  }

  if ("clientX" in event && "clientY" in event) {
    return {
      clientX: event.clientX,
      clientY: event.clientY,
    };
  }

  return null;
}

function areSelectedIdsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();

  return normalizedLeft.every((id, index) => id === normalizedRight[index]);
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
  const hasInitializedView = useRef(false);
  const suppressNextNodeClick = useRef(false);
  const suppressNextPaneClick = useRef(false);
  const didCompleteConnection = useRef(false);
  const connectionDragRef = useRef<ConnectionDragState | null>(null);
  const [connectionDrag, setConnectionDrag] = useState<ConnectionDragState | null>(
    null,
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const isPanMode = pointerMode === "pan" && !connectorMode;
  const isSelectMode = pointerMode === "select" && !connectorMode;
  const allowsSingleSelection = !connectorMode;

  const setActiveConnectionDrag = useCallback(
    (nextDrag: ConnectionDragState | null) => {
      connectionDragRef.current = nextDrag;
      setConnectionDrag(nextDrag);
    },
    [],
  );

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
          isConnectionTarget:
            connectionDrag?.validTargetIds.includes(building.id) ?? false,
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
        selected: isSelected,
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
    [baseId],
  );

  const getSourceItemId = useCallback(
    (sourceBuilding: BaseLayoutBuilding): string | null => {
      if (sourceBuilding.buildingType === "receiver") {
        return sourceBuilding.itemId;
      }

      const sourceBuildingDef = buildingsById[sourceBuilding.buildingId];
      const sourceRecipe = sourceBuildingDef?.recipes?.[sourceBuilding.recipeIndex];

      return sourceRecipe?.output.id ?? null;
    },
    [buildingsById],
  );

  const validateConnectionAttempt = useCallback(
    (
      sourceId: string,
      targetId: string,
    ): {
      isValid: boolean;
      itemId: string | null;
    } => {
      if (sourceId === targetId) {
        return { isValid: false, itemId: null };
      }

      const sourceBuilding = buildings.find((building) => building.id === sourceId);
      const targetBuilding = buildings.find((building) => building.id === targetId);

      if (!sourceBuilding || !targetBuilding) {
        return { isValid: false, itemId: null };
      }

      const itemId = getSourceItemId(sourceBuilding);
      if (!itemId) {
        return { isValid: false, itemId: null };
      }

      const validation = validateConnection(
        sourceBuilding,
        targetBuilding,
        itemId,
        connectorMode ?? 1,
        buildingsById,
        connections,
      );

      return {
        isValid: validation.isValid,
        itemId,
      };
    },
    [buildings, buildingsById, connections, connectorMode, getSourceItemId],
  );

  const startConnectionDrag = useCallback(
    (sourceId: string) => {
      const sourceBuilding = buildings.find((building) => building.id === sourceId);
      if (!sourceBuilding) {
        setActiveConnectionDrag(null);
        return;
      }

      const itemId = getSourceItemId(sourceBuilding);
      if (!itemId) {
        setActiveConnectionDrag(null);
        return;
      }

      const validTargetIds = buildings
        .filter((building) => building.id !== sourceId)
        .filter((building) => validateConnectionAttempt(sourceId, building.id).isValid)
        .map((building) => building.id);

      setActiveConnectionDrag({
        fromNodeId: sourceId,
        itemId,
        validTargetIds,
      });
    },
    [buildings, getSourceItemId, setActiveConnectionDrag, validateConnectionAttempt],
  );

  // Handle connection creation
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const validation = validateConnectionAttempt(
        connection.source,
        connection.target,
      );
      if (!validation.isValid || !validation.itemId) {
        return;
      }

      // Use connector mode rail tier, default to tier 1
      const railTier: RailTier = connectorMode ?? 1;
      didCompleteConnection.current = true;

      // Dispatch add connection event
      dispatch([
        EVENT_IDS.BASES_LAYOUT_ADD_CONNECTION,
        baseId,
        connection.source,
        connection.target,
        validation.itemId,
        railTier,
      ]);

      // Clear connection drag state
      setActiveConnectionDrag(null);
    },
    [baseId, connectorMode, setActiveConnectionDrag, validateConnectionAttempt],
  );

  const handleConnectStart = useCallback(
    (
      _event: MouseEvent | TouchEvent,
      params: { nodeId?: string | null; handleType?: string | null },
    ) => {
      didCompleteConnection.current = false;

      if (params.handleType !== "source" || !params.nodeId) {
        setActiveConnectionDrag(null);
        return;
      }

      startConnectionDrag(params.nodeId);
    },
    [startConnectionDrag],
  );

  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (didCompleteConnection.current) {
        didCompleteConnection.current = false;
        setActiveConnectionDrag(null);
        return;
      }

      const activeConnectionDrag = connectionDragRef.current;

      if (!activeConnectionDrag) {
        return;
      }

      const clientPosition = getClientPositionFromPointerEvent(event);
      if (!clientPosition) {
        setActiveConnectionDrag(null);
        return;
      }

      const dropTarget = document.elementFromPoint(
        clientPosition.clientX,
        clientPosition.clientY,
      );

      if (!(dropTarget instanceof Element)) {
        setActiveConnectionDrag(null);
        return;
      }

      const targetNode = dropTarget.closest(".react-flow__node");
      const targetId = targetNode?.getAttribute("data-id");

      if (
        targetId &&
        activeConnectionDrag.validTargetIds.includes(targetId) &&
        targetId !== activeConnectionDrag.fromNodeId
      ) {
        handleConnect({
          source: activeConnectionDrag.fromNodeId,
          target: targetId,
          sourceHandle: null,
          targetHandle: null,
        });
        return;
      }

      setActiveConnectionDrag(null);
    },
    [handleConnect, setActiveConnectionDrag],
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
    (event: React.MouseEvent, node: Node) => {
      if (suppressNextNodeClick.current) {
        suppressNextNodeClick.current = false;
        return;
      }

      if (!connectorMode) {
        if (!allowsSingleSelection) {
          return;
        }

        if (event.ctrlKey || event.metaKey) {
          const isAlreadySelected = selectedBuildingIds.includes(node.id);
          const nextIds = isAlreadySelected
            ? selectedBuildingIds.filter((id) => id !== node.id)
            : [...selectedBuildingIds, node.id];
          dispatch([EVENT_IDS.BASES_LAYOUT_SET_SELECTION, nextIds, []]);
          return;
        }

        dispatch([EVENT_IDS.BASES_LAYOUT_SET_SELECTED_BUILDING, node.id]);
        return;
      }

      if (!connectionDrag) {
        // Start connection drag
        startConnectionDrag(node.id);
      } else {
        if (connectionDrag.fromNodeId === node.id) {
          setActiveConnectionDrag(null);
          return;
        }

        // Complete connection
        if (connectionDrag.validTargetIds.includes(node.id)) {
          handleConnect({
            source: connectionDrag.fromNodeId,
            target: node.id,
            sourceHandle: null,
            targetHandle: null,
          });
          return;
        }
      }
    },
    [
      allowsSingleSelection,
      connectorMode,
      connectionDrag,
      handleConnect,
      selectedBuildingIds,
      setActiveConnectionDrag,
      startConnectionDrag,
    ],
  );

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      if (connectorMode || pointerMode !== "select") {
        return;
      }

      const nextSelectedNodeIds = selectedNodes.map((node) => node.id);
      const nextSelectedEdgeIds = selectedEdges.map((edge) => edge.id);

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
      setActiveConnectionDrag(null);
    }
    if (selectedBuildingIds.length > 0 || selectedConnectionIds.length > 0) {
      dispatch([EVENT_IDS.BASES_LAYOUT_SET_SELECTION, [], []]);
    }
  }, [
    connectionDrag,
    setActiveConnectionDrag,
    selectedBuildingIds.length,
    selectedConnectionIds.length,
  ]);

  // Handle edge click - select connection
  const handleEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      if (!allowsSingleSelection) {
        return;
      }
      event.stopPropagation();
      suppressNextPaneClick.current = true;

      if (event.ctrlKey || event.metaKey) {
        const isAlreadySelected = selectedConnectionIds.includes(edge.id);
        const nextIds = isAlreadySelected
          ? selectedConnectionIds.filter((id) => id !== edge.id)
          : [...selectedConnectionIds, edge.id];
        dispatch([EVENT_IDS.BASES_LAYOUT_SET_SELECTION, [], nextIds]);
        return;
      }

      dispatch([EVENT_IDS.BASES_LAYOUT_SET_SELECTED_CONNECTION, edge.id]);
    },
    [allowsSingleSelection, selectedConnectionIds],
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
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
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
        elementsSelectable={allowsSingleSelection}
        connectionLineType={ConnectionLineType.Bezier}
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        autoPanOnNodeDrag={false}
        panOnDrag={isPanMode}
        selectionOnDrag={isSelectMode}
        selectNodesOnDrag={false}
        selectionMode={SelectionMode.Full}
        connectionMode={ConnectionMode.Strict}
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
