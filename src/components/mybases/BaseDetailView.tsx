import React, { useState, useCallback } from "react";
import { useSubscription } from "@flexsurfer/reflex";
import { SUB_IDS } from "../../state/sub-ids";
import type { Base } from "../../state/db";
import {
  BaseCoreInfo,
  BaseBuildingsView,
  BasePlansView,
  CreateProductionPlanModal,
} from "./index";
import { BaseLayoutView } from "./layout";
import BaseLayoutBalanceSummary from "./layout/components/BaseLayoutBalanceSummary";

type BaseDetailTab = "plans" | "buildings" | "layout";

export const BaseDetailView: React.FC = () => {
  const selectedBase = useSubscription<Base | null>([
    SUB_IDS.BASES_SELECTED_BASE,
  ]);
  const [activeTab, setActiveTab] = useState<BaseDetailTab>(
    "plans" as BaseDetailTab,
  );
  const [isLayoutBalanceExpanded, setIsLayoutBalanceExpanded] = useState(true);

  const toggleLayoutBalance = useCallback(() => {
    setIsLayoutBalanceExpanded((prev) => !prev);
  }, []);

  // Early return if no base selected
  if (!selectedBase) {
    return null;
  }

  const plansCount = selectedBase.productions?.length || 0;
  const buildingsCount = selectedBase.buildings?.length || 0;
  const layoutBuildingsCount = selectedBase.layout?.buildings?.length || 0;

  return (
    <div className="h-full flex flex-col">
      {/* If layout tab is active, show full-page layout view */}
      {activeTab === "layout" ? (
        <BaseLayoutView onBack={() => setActiveTab("plans")} />
      ) : (
        <>
          {/* Core Info and Stats - Fixed, not scrollable */}
          <div className="mb-4 flex-shrink-0 p-2 lg:p-3">
            <BaseCoreInfo />
          </div>

          {/* Tab Navigation */}
          <div className="flex-shrink-0 mb-4 px-2 lg:px-3">
            <div className="tabs tabs-boxed">
              <button
                className={`tab ${activeTab === "plans" ? "tab-active" : ""}`}
                onClick={() => setActiveTab("plans")}
              >
                📐 Plans
                {plansCount > 0 && (
                  <span className="ml-1 badge badge-sm badge-primary">
                    {plansCount}
                  </span>
                )}
              </button>
              <button
                className={`tab ${activeTab === "buildings" ? "tab-active" : ""}`}
                onClick={() => setActiveTab("buildings")}
              >
                🏭 Buildings
                {buildingsCount > 0 && (
                  <span className="ml-1 badge badge-sm badge-secondary">
                    {buildingsCount}
                  </span>
                )}
              </button>
              <button className="tab" onClick={() => setActiveTab("layout")}>
                🗺️ Layout
                {layoutBuildingsCount > 0 && (
                  <span className="ml-1 badge badge-sm badge-accent">
                    {layoutBuildingsCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Production Balance Section */}
          {selectedBase?.layout && (
            <div className="flex-shrink-0 mb-4 px-2 lg:px-3">
              <div className="bg-base-200 rounded-lg p-2 sm:p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm">Production Balance</h3>
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={toggleLayoutBalance}
                    title={isLayoutBalanceExpanded ? "Collapse" : "Expand"}
                  >
                    {isLayoutBalanceExpanded ? "▼" : "▶"}
                  </button>
                </div>
                {isLayoutBalanceExpanded && (
                  <BaseLayoutBalanceSummary baseId={selectedBase.id} />
                )}
              </div>
            </div>
          )}

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden px-2 lg:px-3">
            {activeTab === "plans" && (
              <div className="h-full overflow-auto">
                <BasePlansView />
              </div>
            )}

            {activeTab === "buildings" && (
              <div className="h-full overflow-auto">
                <BaseBuildingsView />
              </div>
            )}
          </div>

          <CreateProductionPlanModal />
        </>
      )}
    </div>
  );
};
