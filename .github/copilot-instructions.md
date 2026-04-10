# Copilot Instructions: Rupture Planner

## Project Overview

**Rupture Planner** is a free, open-source production planning tool for the Star Rupture game. It helps players visualize complex production chains, calculate building requirements, optimize resource allocation, and plan base configurations.

**Key Features:**
- Interactive production flow diagrams with auto-layout (Dagre algorithm)
- Smart item catalog with filtering and search
- Recipe browser with collapsible building sections
- Advanced production planner with visual flow diagrams
- Base management system with heat/power calculations
- Corporation progression tracking
- Multi-version data support (Early Access, Playtest)

## Tech Stack

### Core Technologies
- **React 19.1.0** - UI framework
- **TypeScript 5.8.3** - Type-safe JavaScript
- **Vite 7.0.4** - Build tool and dev server
- **React Router DOM 7.8.0** - Client-side routing

### State Management
- **@flexsurfer/reflex** - Custom reactive state management framework (Re-frame inspired)
  - Event-driven architecture with immutable state updates
  - Subscription-based reactive queries
  - Side effect management with coeffects/effects

### UI & Styling
- **Tailwind CSS 4.1.11** - Utility-first CSS framework
- **DaisyUI 5.0.50** - Component library built on Tailwind
- **@xyflow/react 12.8.2** - Interactive flow diagram visualization
- **Dagre 0.8.5** - Directed graph layout algorithm

### Testing
- **Vitest 3.2.4** - Unit test runner
- **@testing-library/react 16.3.0** - Component testing utilities
- **jsdom 26.1.0** - DOM implementation for testing

## Architecture Patterns

### State Management Architecture (Reflex Framework)
See [reflex-instructions.md](./reflex-instructions.md) for detailed guidelines on using the Reflex state management framework effectively in this project.

The project uses a **unidirectional data flow** pattern similar to Re-frame/Redux:

```
User Action → Event → Event Handler → State Update → Subscriptions → UI Update
```

**Reflex Resources:**
- Main docs: [reflex.js.org/docs](https://reflex.js.org/docs)
- Best practices: [reflex.js.org/docs/best-practices.html](https://reflex.js.org/docs/best-practices.html)
- Packages: [@flexsurfer/reflex](https://www.npmjs.com/package/@flexsurfer/reflex), [@flexsurfer/reflex-devtools](https://www.npmjs.com/package/@flexsurfer/reflex-devtools)

#### State Structure

```
src/state/
  db.ts              # App state initialization and types
  event-ids.ts       # Event constant IDs
  events.ts          # Event handlers
  effect-ids.ts      # Effect constant IDs
  effects.ts         # Side effect implementations
  sub-ids.ts         # Subscription constant IDs
  subs.ts            # Subscription computations
```

**State Shape Principles:**
- Grow horizontally (new top-level feature keys), avoid deep nesting
- Normalize entity-like data (`byId` maps + id arrays) for fast lookup
- Keep UI state explicit and separate from domain entities
- If using `Map`/`Set` in DB, call `enableMapSet()` before `initAppDb`

#### Key Concepts:

1. **Events** (`src/state/events.ts`, `src/state/event-ids.ts`)
   - Dispatched via `dispatch([EVENT_IDS.EVENT_NAME, ...payload])`
   - Registered via `regEvent(EVENT_IDS.EVENT_NAME, handler, coeffects?)`
   - Handler receives current state, returns updated state
   - **Must be synchronous** and focused on state transitions
   - **Pure functions** that transform state immutably
   - Validate inputs and guard clauses first; return early on invalid state
   - Never perform async/API/localStorage work directly in events
   - Return effect tuples for side effects: `return [[EFFECT_IDS.SAVE, data]]`
   - When sending mutated draft data to effects, **always use `current(...)`**
   - Events should read all required data from `draftDb` or coeffects — never rely on callers passing subscription-derived state
   - Dispatch calls from views should only carry user intent (IDs, input values, flags)

   **Event Naming:**
   - Keep exported constant keys in `UPPER_SNAKE_CASE`
   - Use namespaced string values: `feature/action` (example: `bases/create`)
   - Keep key and value aligned:
     - `BASES_CREATE` → `bases/create`
     - `PRODUCTION_PLAN_ADD_BUILDINGS_TO_BASE` → `production_plan/add_buildings_to_base`

2. **Subscriptions** (`src/state/subs.ts`, `src/state/sub-ids.ts`)
   - Query state via `useSubscription([SUB_IDS.SUB_NAME, ...params])`
   - Registered via `regSub(SUB_IDS.SUB_NAME, computation, dependencies?)`
   - Define root subscriptions first: `regSub(id, "pathKey")`
   - Build derived subscriptions from other subscriptions only
   - Use parameterized subscriptions for by-id and section-specific queries
   - **Keep subscriptions deterministic and lightweight**
   - **Subscriptions must return data shaped and ready for direct view consumption**
     - All filtering, sorting, formatting, and joining should happen in the subscription layer
     - Components should never transform or reshape subscription data
   - Move heavy computations to events (precompute once, read many)
   - Avoid repeated expensive derivations in hot subscriptions
   - Can chain subscriptions (subscribe to other subscriptions)
   - Automatically recompute when dependencies change

3. **Effects/Coeffects** (`src/state/effects.ts`, `src/state/effect-ids.ts`)
   - **Effects**: Side effects (localStorage, HTTP, timers, analytics, navigation)
   - **Coeffects**: Inject external data into event handlers (time, random, env, localStorage)
   - Registered via `regEffect(id, fn)` / `regCoeffect(id, fn)`
   - Keep event handlers pure by isolating side effects
   - Effects should be small, defensive, and fail-soft (log, do not crash app state flow)
   - Put all I/O here: localStorage, HTTP, timers, analytics, navigation
   - Prefer deterministic coeffects instead of direct globals for testability

4. **Database** (`src/state/db.ts`)
   - Central application state defined via `initAppDb()`
   - TypeScript interfaces for all state shapes
   - Versioned game data (Early Access, Playtest)

### Component Organization

```
src/
├── components/          # Feature-based component organization
│   ├── [FeatureName]Page.tsx     # Top-level page component
│   ├── [feature]/                # Feature module
│   │   ├── index.ts              # Public exports
│   │   ├── types.ts              # Feature-specific types
│   │   ├── components/           # Feature components
│   │   ├── hooks/                # Feature-specific hooks
│   │   ├── utils/                # Feature utilities
│   │   └── modals/               # Feature modal dialogs
│   └── ui/                       # Shared UI components
├── contexts/           # React contexts
├── data/              # Game data (JSON files per version)
├── hooks/             # Shared custom hooks
├── state/             # Reflex state management
└── utils/             # Shared utility functions
```

### Data Flow Patterns

#### Reading State (Subscriptions)
```tsx
import { useSubscription } from '@flexsurfer/reflex';
import { SUB_IDS } from '../state/sub-ids';

const items = useSubscription<Item[]>([SUB_IDS.ITEMS_LIST]);
const selectedItem = useSubscription<Item | null>(
  [SUB_IDS.SELECTED_ITEM, itemId]
);
```

#### Updating State (Events)
```tsx
import { dispatch } from '@flexsurfer/reflex';
import { EVENT_IDS } from '../state/event-ids';

const handleClick = () => {
  dispatch([EVENT_IDS.SET_SELECTED_ITEM, itemId]);
};
```

#### Custom Hooks Pattern
```tsx
// Feature-specific hook that combines subscriptions and events
export function useFeatureData() {
  const data = useSubscription<Data[]>([SUB_IDS.FEATURE_DATA]);
  
  const updateData = (newData: Data) => {
    dispatch([EVENT_IDS.UPDATE_FEATURE_DATA, newData]);
  };
  
  return { data, updateData };
}
```

### React Component Contract with Reflex

**Components should only:**
- Subscribe to minimal required data
- Dispatch events on user intent (pass only user-provided values — e.g. input text, selected id)
- Never forward subscription data back through dispatch; event handlers read from DB themselves
- Render UI

**Component State Rules:**
- Use direct React hooks (`useState`, `useReducer`) only for local/ephemeral component concerns:
  - Temporary form/input draft state before dispatch
  - UI-only toggles scoped to one component (hover/open/focus)
  - Refs, DOM measurement, animation lifecycle
- Do not mirror Reflex global state in `useState`/`useReducer`
- If state is shared, persisted, or business-relevant, keep it in Reflex DB via events/subscriptions
- Never transform, filter, sort, or reshape subscription data inside a component
  - If the view needs a different shape, create a dedicated subscription that returns it ready to render
- Keep `useEffect` thin in components; business side effects belong in Reflex effects/coeffects
- Do not place business rules/validation pipelines in component handlers
- Avoid over-subscription (row/item components should not subscribe to full collections)

## Code Conventions

### Naming Conventions

- **Files:**
  - Components: PascalCase (`ItemsPage.tsx`, `RecipeCard.tsx`)
  - Utilities: camelCase (`itemUtils.ts`, `recipeUtils.ts`)
  - Types: camelCase (`types.ts`)
  - Hooks: camelCase prefixed with `use` (`useItemsData.ts`)
  - Index exports: `index.ts` (barrel exports)

- **Types:**
  - Interfaces: PascalCase (`Item`, `Recipe`, `Building`)
  - Type aliases: PascalCase (`TabType`, `DataVersion`)
  - Props interfaces: `ComponentNameProps`

- **Constants:**
  - UPPER_SNAKE_CASE for constants (`EFFECT_IDS`, `EVENT_IDS`, `SUB_IDS`)
  - Organization: Grouped in dedicated files (`effect-ids.ts`, `event-ids.ts`, `sub-ids.ts`)

- **Functions:**
  - camelCase for regular functions
  - PascalCase for React components
  - Event handlers prefixed with `handle` (`handleClick`, `handleSubmit`)
  - Boolean getters prefixed with `is`/`has` (`isAmplifierBuilding`, `hasRecipe`)

### TypeScript Guidelines

- **Strict mode enabled** - No implicit any, strict null checks
- **Explicit return types** for public functions
- **Interface over type** for object shapes
- **Type imports** using `import type` when importing only types
- **Generics** for reusable components and utilities

### Component Patterns

#### Page Components
```tsx
// Top-level page component structure
const FeaturePage = () => {
  // 1. Hooks (subscriptions, state)
  const data = useSubscription<Data[]>([SUB_IDS.FEATURE_DATA]);
  const [localState, setLocalState] = useState<State>(initialState);
  
  // 2. Event handlers
  const handleAction = () => {
    dispatch([EVENT_IDS.FEATURE_ACTION, payload]);
  };
  
  // 3. Render
  return (
    <div className="h-full p-2 lg:p-3 flex flex-col">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-base-100">
        {/* Controls */}
      </div>
      
      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        {/* Main content */}
      </div>
    </div>
  );
};
```

#### Barrel Exports
```tsx
// index.ts - Export all public APIs
export { ComponentA } from './ComponentA';
export { ComponentB } from './ComponentB';
export * from './types';
export * from './hooks';
```

### Styling Conventions

- **Tailwind utility classes** - Primary styling method
- **DaisyUI components** - Use semantic component classes (`btn`, `card`, `badge`)
- **Responsive design** - Mobile-first with sm/md/lg breakpoints
- **Dark mode support** - Via DaisyUI theme system
- **Color semantics:**
  - `primary` - Main actions
  - `secondary` - Secondary actions
  - `accent` - Highlights
  - `neutral` - Backgrounds
  - `info`/`success`/`warning`/`error` - States

### Data Management

#### Game Data Structure
```
data/
├── earlyaccess/
│   ├── items_catalog.json
│   ├── buildings_and_recipes.json
│   └── corporations_components.json
└── playtest/
    ├── items_catalog.json
    ├── buildings_and_recipes.json
    └── corporations_components.json
```

- **Versioned data** - Multiple game versions supported
- **Static JSON imports** - Bundled at build time
- **Parsed at init** - Transformed to TypeScript interfaces in `db.ts`

#### Local Storage
- **Theme preference** - `localStorage.getItem('theme')`
- **Data version** - `localStorage.getItem('dataVersion')`
- **User bases** - Debounced persistence (500ms)
- **Energy groups** - Immediate persistence

## Feature-Specific Guidelines

### Production Planner

- **Flow builder** (`src/components/planner/core/productionFlowBuilder.ts`)
  - Three-phase algorithm: Normalize → Fulfill → Finalize
  - Recursive demand fulfillment with external inputs
  - Raw material deficit calculation
  
- **ReactFlow integration** (`@xyflow/react`)
  - Dagre layout for auto-positioning nodes
  - Custom node/edge components
  - Minimap and controls enabled
  - Auto-fit on item selection

- **Lazy loading** - PlannerPage is lazy-loaded to reduce initial bundle

### Base Management

- **Building placement** - Track buildings by section (Defense, Production, etc.)
- **Heat calculations** - Base core capacity and amplifiers
- **Energy groups** - Group buildings for power management
- **Production plans** - Template-based building requirements

### Items & Recipes

- **Filtering** - By category, building, search term
- **Corporation usage** - Track which corporations use items
- **Recipe lookup** - Find recipes by output item ID
- **Modal patterns** - Recipe details in modal dialogs

## Development Workflow

### Running Locally
```bash
npm install           # Install dependencies
npm run dev          # Start dev server (localhost:5173)
npm run build        # Production build
npm run preview      # Preview production build
```

### Testing
```bash
npm test             # Run tests in watch mode
npm run test:ui      # Run tests with UI
npm run test:run     # Run tests once
```

### Linting
```bash
npm run lint         # ESLint check
```

### Deployment
```bash
npm run deploy       # Deploy to GitHub Pages
```

## Best Practices

### State Management (Reflex)

1. **Keep event handlers pure** - No side effects in handlers
2. **Use coeffects for external data** - Inject data via coeffects
3. **Return effects for side effects** - Return effect tuples from handlers
4. **Subscribe at the right level** - Subscribe in components that use the data
5. **Avoid over-subscribing** - Combine related subscriptions
6. **Events read from DB** - Never pass subscription data through dispatch; events should read all required data from `draftDb` or coeffects
7. **Use `current(...)` for effects** - When sending mutated draft data to effects, always use `current(...)`
8. **Avoid unnecessary object recreation** - Don't use `{...obj}` or `[...arr]` when no actual change is needed
9. **Subscriptions return view-ready data** - All filtering, sorting, formatting should happen in subscriptions, not components
10. **Move heavy computations to events** - Precompute once in events, read many times in subscriptions

### AI Code Generation Checklist

Before finalizing AI-generated code, verify:
- [ ] IDs added/updated in all relevant `*-ids.ts` files
- [ ] Event namespaced and descriptive (`feature/action` pattern)
- [ ] Side effects isolated to effects/coeffects
- [ ] `current(...)` used when passing draft-derived data to effects
- [ ] No unnecessary object/array recreation in events
- [ ] Expensive work not placed in frequently re-run subscriptions
- [ ] Subscriptions return view-ready data; components do not reshape subscription output
- [ ] Dispatch calls from components pass only user intent, not subscription data
- [ ] Events read all needed data from DB themselves
- [ ] Tests added for new event/subscription behavior

### Performance

1. **Lazy load heavy features** - Use `lazy()` for large components
2. **Memoize expensive computations** - Use `useMemo` for complex calculations
3. **Debounce frequent updates** - Debounce localStorage writes
4. **Optimize list rendering** - Use proper keys and conditional rendering

### Type Safety

1. **Define types early** - Create `types.ts` for feature types
2. **Use discriminated unions** - For variant types (node types, etc.)
3. **Avoid `any`** - Use `unknown` and type guards instead
4. **Export types** - Make types available in barrel exports

### Component Design

1. **Single responsibility** - Each component does one thing well
2. **Composition over inheritance** - Build complex UIs from simple components
3. **Props drilling limit** - Use context or state management for deep props
4. **Extract reusable logic** - Create custom hooks for shared logic

## Common Tasks

### Adding a New Feature Page

1. Create `src/components/NewFeaturePage.tsx`
2. Create feature directory `src/components/newfeature/`
3. Add route in `src/App.tsx`
4. Add tab in `src/components/TabLayout.tsx`
5. Add event/sub IDs in `src/state/event-ids.ts` and `src/state/sub-ids.ts`
6. Register events in `src/state/events.ts`
7. Register subscriptions in `src/state/subs.ts`
8. Add state shape in `src/state/db.ts`

### Adding a New Subscription

1. Define ID in `src/state/sub-ids.ts`
2. Register in `src/state/subs.ts`:
   ```typescript
   regSub(SUB_IDS.MY_SUB, 
     [SUB_IDS.DEPENDENCY],
     (dependency: SomeType): ResultType => {
       // Compute derived data
       return result;
     }
   );
   ```
3. Use in component:
   ```typescript
   const result = useSubscription<ResultType>([SUB_IDS.MY_SUB]);
   ```

### Adding a New Event

1. Define ID in `src/state/event-ids.ts`
2. Register in `src/state/events.ts`:
   ```typescript
   regEvent(EVENT_IDS.MY_EVENT, 
     (db: AppState, payload: PayloadType): AppState => {
       db.someField = payload;
       return db;
     }
   );
   ```
3. Dispatch in component:
   ```typescript
   dispatch([EVENT_IDS.MY_EVENT, payload]);
   ```

### Adding New Game Data

1. Update JSON files in `src/data/[version]/`
2. Update TypeScript interfaces in `src/state/db.ts`
3. Update parsing in `src/state/data-utils.ts`
4. Test with both data versions

## Testing Guidelines

- **Test user interactions** - Click, type, select
- **Test state updates** - Verify dispatch calls
- **Test edge cases** - Empty states, missing data
- **Mock external dependencies** - Mock localStorage, fetch
- **Use Testing Library queries** - Prefer `getByRole`, `getByLabelText`

## Resources

- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Reflex Documentation](https://reflex.js.org/docs)
- [Reflex Best Practices](https://reflex.js.org/docs/best-practices.html)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [DaisyUI](https://daisyui.com/)
- [ReactFlow](https://reactflow.dev/)
- [Vitest](https://vitest.dev/)

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed contribution guidelines.

---

**Last Updated:** February 28, 2026  
**Project Version:** 0.0.0  
**License:** MIT
