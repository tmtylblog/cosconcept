"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Loader2, Linkedin, Mail, Users, ExternalLink } from "lucide-react";

// Lazy-load existing pages to avoid bundling everything upfront
const LinkedInCampaignsPage = dynamic(
  () => import("../linkedin/campaigns/page"),
  { loading: () => <TabLoading /> },
);
const InstantlyPage = dynamic(() => import("../instantly/page"), {
  loading: () => <TabLoading />,
});

function TabLoading() {
  return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="h-6 w-6 animate-spin text-cos-primary" />
    </div>
  );
}

const TABS = [
  { key: "linkedin", label: "LinkedIn Campaigns", icon: Linkedin },
  { key: "instantly", label: "Instantly", icon: Mail },
  { key: "accounts", label: "Accounts", icon: Users },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function CampaignTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = (searchParams.get("tab") as TabKey) || "linkedin";

  function setTab(tab: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-cos-border">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "border-cos-primary text-cos-primary"
                  : "border-transparent text-cos-text-secondary hover:text-cos-text-primary hover:border-cos-border"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "linkedin" && <LinkedInCampaignsPage />}
        {activeTab === "instantly" && <InstantlyPage />}
        {activeTab === "accounts" && (
          <div className="rounded-xl border border-cos-border bg-cos-bg-primary p-8 text-center space-y-3">
            <Users className="h-10 w-10 text-cos-text-tertiary mx-auto" />
            <p className="text-cos-text-secondary">
              LinkedIn accounts are managed in the Settings page.
            </p>
            <Link
              href="/admin/growth-ops/settings?tab=linkedin"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cos-primary text-white text-sm font-medium hover:bg-cos-primary/90 transition-colors"
            >
              Manage Accounts
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-cos-text-primary mb-6">Campaigns</h1>
      <Suspense fallback={<TabLoading />}>
        <CampaignTabs />
      </Suspense>
    </div>
  );
}
