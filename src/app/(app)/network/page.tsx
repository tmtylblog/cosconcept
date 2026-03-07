"use client";

import { Users, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NetworkPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold text-cos-midnight">
            Your Network
          </h2>
          <p className="mt-1 text-sm text-cos-slate">
            Firms you&apos;re connected with.
          </p>
        </div>
        <Button size="sm">
          <UserPlus className="mr-1.5 h-3.5 w-3.5" />
          Invite
        </Button>
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center rounded-cos-2xl border border-dashed border-cos-border py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-cos-full bg-cos-signal/10">
          <Users className="h-6 w-6 text-cos-signal" />
        </div>
        <h3 className="mt-4 font-heading text-sm font-semibold text-cos-midnight">
          No connections yet
        </h3>
        <p className="mt-1 max-w-xs text-xs text-cos-slate">
          When you connect with partner firms, they&apos;ll appear here. Ask Ossy
          to find potential partners, or search the Discover tab.
        </p>
      </div>
    </div>
  );
}
