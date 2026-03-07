"use client";

import { Building2, Globe, Users, MapPin, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveOrganization } from "@/lib/auth-client";

export default function FirmPage() {
  const { data: activeOrg } = useActiveOrganization();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold text-cos-midnight">
            Firm Profile
          </h2>
          <p className="mt-1 text-sm text-cos-slate">
            How partners see you on the network.
          </p>
        </div>
        <Button size="sm">Edit Profile</Button>
      </div>

      {/* Profile card */}
      <div className="rounded-cos-2xl border border-cos-border bg-cos-surface-raised p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-cos-xl bg-cos-electric/10 text-cos-electric">
            <Building2 className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <h3 className="font-heading text-base font-semibold text-cos-midnight">
              {activeOrg?.name ?? "Your Firm"}
            </h3>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-cos-slate">
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" /> Website not set
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Location not set
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> Size not set
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Founded —
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Profile completeness */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-cos-midnight">
            Profile Completeness
          </p>
          <span className="text-sm font-semibold text-cos-electric">0%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-cos-full bg-cos-cloud-dim">
          <div className="h-full w-0 rounded-cos-full bg-cos-electric transition-all" />
        </div>
        <p className="mt-2 text-xs text-cos-slate">
          Complete your profile to start receiving AI-powered partnership
          matches. Tell Ossy about your firm to get started.
        </p>
      </div>

      {/* Sections placeholder */}
      <div className="space-y-3">
        {["Services & Skills", "Industries", "Case Studies", "Partner Preferences"].map(
          (section) => (
            <div
              key={section}
              className="flex items-center justify-between rounded-cos-xl border border-dashed border-cos-border p-4"
            >
              <p className="text-sm text-cos-slate-dim">{section}</p>
              <Button variant="outline" size="sm">
                Add
              </Button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
