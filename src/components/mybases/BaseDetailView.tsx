import React, { useState } from "react";
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

type BaseDetailTab = "plans" | "buildings" | "balance" | "layout";

export const BaseDetailView: React.FC = () => {
  const selectedBase = useSubscription<Base | null>([
    SUB_IDS.BASES_SELECTED_BASE,
  ]);
  const [activeTab, setActiveTab] = useState<BaseDetailTab>(
    "plans" as BaseDetailTab,
  );

  // Early return if no base selected
  if (!selectedBase) {
    return null;
  }

  const plansCount = selectedBase.productions?.length || 0;
  const buildingsCount = selectedBase.buildings?.length || 0;
  const layoutBuildingsCount = selectedBase.layout?.buildings?.length || 0;
  const hasLayout = Boolean(selectedBase.layout);

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* If layout tab is active, show full-page layout view */}
      {activeTab === "layout" ? (
        <BaseLayoutView onBack={() => setActiveTab("plans")} />
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 lg:px-3 lg:pb-4">
            <div className="mb-4">
              <BaseCoreInfo />
            </div>

            <div className="mb-4">
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
                {hasLayout && (
                  <button
                    className={`tab ${activeTab === "balance" ? "tab-active" : ""}`}
                    onClick={() => setActiveTab("balance")}
                  >
                    ⚖️ Balance
                  </button>
                )}
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

            {activeTab === "plans" && (
              <div>
                <BasePlansView />
              </div>
            )}

            {activeTab === "buildings" && (
              <div>
                <BaseBuildingsView />
              </div>
            )}

            {activeTab === "balance" && hasLayout && (
              <div className="bg-base-200 rounded-lg p-3 sm:p-4">
                <h3 className="font-semibold text-sm mb-3">Production Balance</h3>
                <BaseLayoutBalanceSummary baseId={selectedBase.id} />
              </div>
            )}
          </div>

          <CreateProductionPlanModal />
        </>
      )}
    </div>
  );
};
