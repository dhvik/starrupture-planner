// Re-export layout types from db
export type {
    RailTier,
    BaseLayoutBuilding,
    BaseLayoutConnection,
    BaseLayout,
    BaseLayoutBalance,
} from '../../../state/db';

export type { ConnectionValidation } from './utils/connectionValidator';
export type { GridPosition, GridBounds } from './utils/gridUtils';

// UI interaction modes
export type ConnectionMode = 'none' | 'selecting';

export interface ConnectionCreationState {
    mode: ConnectionMode;
    fromBuildingId: string | null;
    toBuildingId: string | null;
    itemId: string | null;
}
