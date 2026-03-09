"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { NavBar } from "@/components/nav-bar";
import { ChatPanel } from "@/components/chat-panel";
import { LoginPanel } from "@/components/login-panel";
import { EnrichmentProvider, useEnrichment } from "@/hooks/use-enrichment";
import { ProfileProvider } from "@/hooks/use-profile";
import { GuestDataProvider, useGuestData } from "@/hooks/use-guest-data";
import { useSession, useActiveOrganization } from "@/lib/auth-client";
import { getEmailDomain, isPersonalEmail } from "@/lib/email-validation";
import { MessageCircle, X } from "lucide-react";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GuestDataProvider>
      <AppLayoutOuter>{children}</AppLayoutOuter>
    </GuestDataProvider>
  );
}

/** Outer wrapper — gets org ID and provides it to EnrichmentProvider */
function AppLayoutOuter({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: activeOrg } = useActiveOrganization();

  return (
    <EnrichmentProvider organizationId={activeOrg?.id}>
      <ProfileProvider organizationId={activeOrg?.id}>
        <AppLayoutInner>{children}</AppLayoutInner>
      </ProfileProvider>
    </EnrichmentProvider>
  );
}

function AppLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { data: activeOrg } = useActiveOrganization();
  const {
    status: enrichmentStatus,
    result: enrichmentResult,
    triggerEnrichment,
    reset: resetEnrichment,
  } = useEnrichment();
  const {
    guestPreferences,
    hasGuestData,
    clearGuestData,
  } = useGuestData();
  const isGuest = !session?.user;

  const [navCollapsed, setNavCollapsed] = useState(true);
  const [loginPanelOpen, setLoginPanelOpen] = useState(false);
  const [chatKey, setChatKey] = useState(0);
  const [mobileChat, setMobileChat] = useState(false);

  // ─── Auto-enrich on sign-in: extract domain from email ──────
  const enrichTriggeredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session?.user?.email) return;
    if (enrichTriggeredRef.current === session.user.email) return;

    const domain = getEmailDomain(session.user.email);
    if (!domain || isPersonalEmail(session.user.email)) return;

    // Trigger enrichment if:
    // 1. No enrichment has happened yet (idle)
    // 2. Enrichment is "done" but PDL company data is missing (gap-fill)
    //    The gap-aware triggerEnrichment will only call paid APIs for missing pieces
    const needsEnrichment =
      enrichmentStatus === "idle" ||
      (enrichmentStatus === "done" && !enrichmentResult?.companyData);

    if (needsEnrichment) {
      enrichTriggeredRef.current = session.user.email;
      const isGapFill = enrichmentStatus === "done";
      console.log(
        `[Layout] Auto-enriching from email domain: ${domain}` +
        (isGapFill ? " (gap-fill: missing PDL data)" : "")
      );
      triggerEnrichment(domain, isGapFill);
    }
  }, [session?.user?.email, enrichmentStatus, enrichmentResult?.companyData, triggerEnrichment]);

  // ─── Guest-to-auth data migration ──────────────────────────
  const migrationDoneRef = useRef(false);

  useEffect(() => {
    if (!session?.user || !activeOrg?.id || !hasGuestData || migrationDoneRef.current) return;
    migrationDoneRef.current = true;

    async function migrateGuestData() {
      try {
        const prefKeys = Object.keys(guestPreferences);
        if (prefKeys.length > 0) {
          console.log(`[Layout] Migrating ${prefKeys.length} guest preferences...`);
          const res = await fetch("/api/onboarding/migrate-preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              organizationId: activeOrg!.id,
              preferences: guestPreferences,
            }),
          });
          if (!res.ok) {
            console.warn("[Layout] Preference migration failed:", await res.text());
            migrationDoneRef.current = false; // allow retry
            return;
          }
          console.log("[Layout] Guest preferences migrated successfully");
        }

        // Clear guest data after successful migration
        clearGuestData();
      } catch (err) {
        console.error("[Layout] Guest data migration error:", err);
        migrationDoneRef.current = false; // allow retry
      }
    }

    migrateGuestData();
  }, [session?.user, activeOrg?.id, hasGuestData, guestPreferences, clearGuestData]);

  const handleRequestLogin = () => {
    setLoginPanelOpen(true);
  };

  const handleLoginSuccess = () => {
    window.location.reload();
  };

  /** DEV: Simulate adding a new agency — resets chat + enrichment state */
  const handleSimulateNewUser = () => {
    resetEnrichment();
    setChatKey((k) => k + 1);
    if (pathname !== "/dashboard") {
      router.push("/dashboard");
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-cos-cloud to-[#e8e4dd]">
      {/* Left: Collapsible navigation */}
      <NavBar
        collapsed={navCollapsed}
        onToggle={() => setNavCollapsed(!navCollapsed)}
        isGuest={isGuest}
        onRequestLogin={handleRequestLogin}
        onSimulateNewUser={handleSimulateNewUser}
      />

      {/* Center: Rich content area */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto bg-cos-cloud/60">
        {children}
      </main>

      {/* Right: Chat panel — desktop (always visible) */}
      {!isGuest && (
        <aside className="hidden w-96 shrink-0 flex-col border-l border-cos-border/30 bg-cos-cloud/60 lg:flex">
          <ChatPanel
            key={chatKey}
            isGuest={isGuest}
            onRequestLogin={handleRequestLogin}
          />
        </aside>
      )}

      {/* Mobile: Floating Ossy button + full-screen chat overlay */}
      {!isGuest && (
        <>
          {/* Floating button */}
          {!mobileChat && (
            <button
              onClick={() => setMobileChat(true)}
              className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-cos-electric text-white shadow-lg transition-transform hover:scale-105 lg:hidden"
              aria-label="Open Ossy chat"
            >
              <MessageCircle className="h-5 w-5" />
            </button>
          )}

          {/* Full-screen overlay */}
          {mobileChat && (
            <div className="fixed inset-0 z-50 flex flex-col bg-cos-cloud lg:hidden">
              <div className="flex h-12 items-center justify-end border-b border-cos-border/30 px-4">
                <button
                  onClick={() => setMobileChat(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-cos-full text-cos-slate-dim hover:bg-cos-cloud-dim hover:text-cos-midnight"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ChatPanel
                  key={chatKey}
                  isGuest={isGuest}
                  onRequestLogin={handleRequestLogin}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Guest chat — full-screen with branding */}
      {isGuest && (
        <div className="fixed inset-0 z-30 flex flex-col items-center bg-cos-cloud/80 backdrop-blur-sm">
          {/* Branding header */}
          <div className="flex shrink-0 flex-col items-center gap-1 pb-2 pt-6">
            <Image
              src="/logo.png"
              alt="Collective OS"
              width={48}
              height={48}
              className="h-12 w-12 rounded-cos-xl"
            />
            <h1 className="font-heading text-lg font-bold text-cos-midnight">
              Collective OS
            </h1>
            <p className="text-xs text-cos-slate-dim">
              Grow Faster Together
            </p>
          </div>

          {/* Chat panel */}
          <div className="flex w-full max-w-2xl flex-1 flex-col overflow-hidden">
            <ChatPanel
              key={chatKey}
              isGuest={true}
              onRequestLogin={handleRequestLogin}
            />
          </div>
        </div>
      )}

      {/* Login modal overlay */}
      {loginPanelOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-cos-midnight/40 backdrop-blur-sm"
            onClick={() => setLoginPanelOpen(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="relative w-full max-w-md rounded-cos-xl border border-cos-border bg-cos-surface p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-heading text-base font-semibold text-cos-midnight">
                  Welcome to Collective OS
                </h2>
                <button
                  onClick={() => setLoginPanelOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-cos-full text-cos-slate-dim transition-colors hover:bg-cos-cloud-dim hover:text-cos-midnight"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <LoginPanel onSuccess={handleLoginSuccess} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
