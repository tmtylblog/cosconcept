"use client";

import { Search, Filter, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/hooks/use-plan";
import { UpgradePrompt } from "@/components/upgrade-prompt";

export default function DiscoverPage() {
  const { canUse } = usePlan();
  const canSearch = canUse("canSearchNetwork");

  if (!canSearch) {
    return (
      <div className="p-6">
        <UpgradePrompt
          feature="Network Search"
          description="Search the entire Collective OS network to find firms that match your ideal partner profile."
          requiredPlan="pro"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Discover Partners
        </h2>
        <p className="mt-1 text-sm text-cos-slate">
          Search the network for firms that complement your services.
        </p>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-cos-xl border border-cos-border bg-cos-cloud px-4 py-2 focus-within:border-cos-electric focus-within:ring-1 focus-within:ring-cos-electric">
          <Search className="h-4 w-4 text-cos-slate" />
          <input
            type="text"
            placeholder="Search by skill, industry, location..."
            className="flex-1 bg-transparent text-sm text-cos-midnight placeholder:text-cos-slate-light focus:outline-none"
          />
        </div>
        <Button variant="outline" size="sm">
          <Filter className="mr-1.5 h-3.5 w-3.5" />
          Filters
        </Button>
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center rounded-cos-2xl border border-dashed border-cos-border py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-cos-full bg-cos-electric/10">
          <Sparkles className="h-6 w-6 text-cos-electric" />
        </div>
        <h3 className="mt-4 font-heading text-sm font-semibold text-cos-midnight">
          Search the Network
        </h3>
        <p className="mt-1 max-w-xs text-xs text-cos-slate">
          Use the search bar above to find firms by skill, industry, location,
          or firm type. Or ask Ossy to find matches for you.
        </p>
      </div>
    </div>
  );
}
