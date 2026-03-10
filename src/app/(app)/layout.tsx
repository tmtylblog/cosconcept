"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { NavBar } from "@/components/nav-bar";
import { ChatPanel } from "@/components/chat-panel";
import { LoginPanel } from "@/components/login-panel";
import { GuestEnrichmentPanel } from "@/components/guest-enrichment-panel";
import { AuthOnboardingPanel } from "@/components/auth-onboarding-panel";
import { EnrichmentProvider, useEnrichment } from "@/hooks/use-enrichment";
import { ProfileProvider } from "@/hooks/use-profile";
import { GuestDataProvider, useGuestData } from "@/hooks/use-guest-data";
import { useOnboardingStatus } from "@/hooks/use-onboarding-status";
import { authClient, useSession, useActiveOrganization } from "@/lib/auth-client";
import { getEmailDomain, isPersonalEmail } from "@/lib/email-validation";
import { MessageCircle, X, Loader2 } from "lucide-react";

/** Convert a domain like "chameleon.co" to a nice org name like "Chameleon" */
function domainToOrgName(domain: string): string {
  const parts = domain.split(".");
  const companyPart = parts[0];
  return companyPart
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── App Phase Type ─────────────────────────────────────────
// Phase 1: landing — guest, no domain submitted
// Phase 2: enriching — guest, domain submitted, enrichment in progress
// Phase 3: onboarding — authenticated but NOT all 9 prefs complete
// Phase 4: authenticated — onboarding complete, full app access
type AppPhase = "landing" | "enriching" | "onboarding" | "authenticated";

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

  const [navCollapsed, setNavCollapsed] = useState(true);
  const [loginPanelOpen, setLoginPanelOpen] = useState(false);
  const [chatKey, setChatKey] = useState(0);
  const [mobileChat, setMobileChat] = useState(false);

  // ─── Auto-provision org + firm for authenticated users with no org ────
  // The moment someone authenticates, an "unclaimed" org + firm is created
  // so ALL data is stored from the very first interaction. This org transitions
  // from onboarding → fully claimed once the user completes the process.
  const orgProvisionedRef = useRef(false);

  useEffect(() => {
    if (!session?.user || activeOrg?.id || orgProvisionedRef.current) return;
    orgProvisionedRef.current = true;

    async function provisionOrg() {
      try {
        // Check if user already has any orgs (maybe just not set active)
        const { data: orgs } = await authClient.organization.list();
        const orgList = (orgs as { id: string; name: string; slug: string }[]) ?? [];

        let orgId: string;

        if (orgList.length > 0) {
          // Has org(s) but none set active — just activate the first one
          orgId = orgList[0].id;
          console.log(`[Layout] Auto-activating existing org: ${orgId}`);
        } else {
          // No org at all — create one from email domain
          const email = session?.user?.email ?? "";
          const domain = email.split("@")[1] ?? "my-firm";
          const orgName = domainToOrgName(domain);
          // Add random suffix to slug to avoid collisions
          const slugBase = domain.replace(/\./g, "-");
          const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;

          console.log(`[Layout] Auto-creating org "${orgName}" (slug: ${slug}) for ${email}`);
          const { data: newOrg, error: createErr } = await authClient.organization.create({
            name: orgName,
            slug,
          });

          if (!newOrg || createErr) {
            console.error("[Layout] Failed to create org:", createErr);
            orgProvisionedRef.current = false;
            return;
          }
          orgId = newOrg.id;
        }

        // Set org active (triggers useActiveOrganization re-render)
        await authClient.organization.setActive({ organizationId: orgId });

        // Ensure serviceFirms row exists for this org
        await fetch("/api/onboarding/ensure-org", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId: orgId }),
        });

        console.log(`[Layout] Org provisioned and active: ${orgId}`);
      } catch (err) {
        console.error("[Layout] Org provisioning failed:", err);
        orgProvisionedRef.current = false;
      }
    }

    provisionOrg();
  }, [session?.user, activeOrg?.id]);

  // ─── Onboarding status (authenticated users only) ─────────
  const {
    onboardingComplete,
    isLoading: onboardingLoading,
    answeredCount,
    totalRequired,
  } = useOnboardingStatus(session?.user ? activeOrg?.id : undefined);

  // Track previous onboardingComplete to detect transition → bump chatKey
  const prevOnboardingCompleteRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevOnboardingCompleteRef.current === false && onboardingComplete === true) {
      // Onboarding just completed — force fresh ChatPanel mount for greeting
      setChatKey((k) => k + 1);
    }
    prevOnboardingCompleteRef.current = onboardingComplete;
  }, [onboardingComplete]);

  // ─── Derive app phase (4 states) ──────────────────────────
  const appPhase: AppPhase = !session?.user
    ? (enrichmentStatus === "idle" ? "landing" : "enriching")
    : onboardingComplete
      ? "authenticated"
      : "onboarding";

  // ─── Auto-enrich on sign-in: extract domain from email ──────
  // Handles domain aliases (e.g., email is @chameleon.co but firm website is chameleoncollective.com).
  // If enrichment data already exists for a domain that the email domain redirects to, skip re-enrichment.
  const enrichTriggeredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session?.user?.email) return;
    if (enrichTriggeredRef.current === session.user.email) return;

    const emailDomain = getEmailDomain(session.user.email);
    if (!emailDomain || isPersonalEmail(session.user.email)) return;

    // If enrichment is already done with company data, check if the email domain
    // is an alias for the enriched domain (e.g., chameleon.co → chameleoncollective.com)
    if (enrichmentStatus === "done" && enrichmentResult?.companyData) {
      // Already enriched — domains might differ but that's fine (alias case)
      enrichTriggeredRef.current = session.user.email;
      if (enrichmentResult.domain && enrichmentResult.domain !== emailDomain) {
        console.log(
          `[Layout] Skipping auto-enrich: email domain (${emailDomain}) differs from enriched domain (${enrichmentResult.domain}), likely an alias`
        );
      }
      return;
    }

    // If enrichment is loading, wait for it
    if (enrichmentStatus === "loading") return;

    // Need enrichment — either idle (no data) or done but missing company data
    const needsEnrichment =
      enrichmentStatus === "idle" ||
      (enrichmentStatus === "done" && !enrichmentResult?.companyData);

    if (needsEnrichment) {
      enrichTriggeredRef.current = session.user.email;
      const isGapFill = enrichmentStatus === "done";
      console.log(
        `[Layout] Auto-enriching from email domain: ${emailDomain}` +
        (isGapFill ? " (gap-fill: missing PDL data)" : "")
      );
      // The lookup route will follow redirects — if chameleon.co → chameleoncollective.com
      // is already cached, it'll return the cached data instead of calling paid APIs
      triggerEnrichment(emailDomain, isGapFill);
    }
  }, [session?.user?.email, enrichmentStatus, enrichmentResult?.companyData, enrichmentResult?.domain, triggerEnrichment]);

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
            migrationDoneRef.current = false;
            return;
          }
          console.log("[Layout] Guest preferences migrated successfully");
        }
        clearGuestData();
      } catch (err) {
        console.error("[Layout] Guest data migration error:", err);
        migrationDoneRef.current = false;
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

  /** DEV: Simulate adding a new agency — resets chat + enrichment + guest data */
  const handleSimulateNewUser = () => {
    resetEnrichment();
    clearGuestData();
    setChatKey((k) => k + 1);
    // Clear all cos_ keys from both storages for a truly fresh start
    try {
      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith("cos_")) sessionStorage.removeItem(key);
      });
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("cos_")) localStorage.removeItem(key);
      });
    } catch { /* ignore */ }
    if (pathname !== "/dashboard") {
      router.push("/dashboard");
    }
  };

  return (
    <>
      {/* ─── PHASE 1: LANDING (guest, no domain yet) ─── */}
      {appPhase === "landing" && (
        <div className="flex h-screen overflow-hidden bg-gradient-to-br from-cos-cloud to-[#e8e4dd]">
          {/* Blurred backdrop with centered chat */}
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

            {/* Centered chat panel */}
            <div className="flex w-full max-w-2xl flex-1 flex-col overflow-hidden">
              <ChatPanel
                key={chatKey}
                isGuest={true}
                onRequestLogin={handleRequestLogin}
              />
            </div>

            {/* Login bypass button — bottom right */}
            <button
              onClick={handleRequestLogin}
              className="fixed bottom-6 right-6 z-40 rounded-cos-pill border border-cos-border/50 bg-white/80 px-4 py-2 text-xs font-medium text-cos-slate-dim backdrop-blur-sm transition-colors hover:border-cos-border hover:text-cos-midnight"
            >
              Already have an account? Sign in
            </button>

            {/* DEV: Simulate New Onboarding — bottom left */}
            <button
              onClick={handleSimulateNewUser}
              className="fixed bottom-6 left-6 z-40 rounded-cos-pill border border-cos-ember/40 bg-cos-ember/10 px-4 py-2 text-xs font-medium text-cos-ember backdrop-blur-sm transition-colors hover:border-cos-ember hover:bg-cos-ember/20"
            >
              🔄 Simulate New Onboarding
            </button>
          </div>
        </div>
      )}

      {/* ─── PHASE 2: ENRICHING (guest, domain submitted) ─── */}
      {appPhase === "enriching" && (
        <div className="animate-fade-slide-in flex h-screen overflow-hidden bg-gradient-to-br from-cos-cloud to-[#e8e4dd]">
          {/* Center: Enrichment cards — mt-auto anchors to bottom while keeping scroll */}
          <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto bg-cos-cloud/60">
            <GuestEnrichmentPanel />
          </main>

          {/* Right: Chat panel — desktop */}
          <aside className="hidden w-96 shrink-0 flex-col border-l border-cos-border/30 bg-cos-cloud/60 lg:flex">
            <ChatPanel
              key={chatKey}
              isGuest={true}
              onRequestLogin={handleRequestLogin}
            />
          </aside>

          {/* Mobile: Floating Ossy button + full-screen chat overlay */}
          {!mobileChat && (
            <button
              onClick={() => setMobileChat(true)}
              className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-cos-electric text-white shadow-lg transition-transform hover:scale-105 lg:hidden"
              aria-label="Open Ossy chat"
            >
              <MessageCircle className="h-5 w-5" />
            </button>
          )}
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
                  isGuest={true}
                  onRequestLogin={handleRequestLogin}
                />
              </div>
            </div>
          )}

          {/* Login bypass — bottom left (visible on all screen sizes) */}
          <button
            onClick={handleRequestLogin}
            className="fixed bottom-6 left-6 z-40 rounded-cos-pill border border-cos-border/50 bg-white/80 px-4 py-2 text-xs font-medium text-cos-slate-dim backdrop-blur-sm transition-colors hover:border-cos-border hover:text-cos-midnight"
          >
            Already have an account? Sign in
          </button>

          {/* DEV: Simulate New Onboarding — bottom center */}
          <button
            onClick={handleSimulateNewUser}
            className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-cos-pill border border-cos-ember/40 bg-cos-ember/10 px-4 py-2 text-xs font-medium text-cos-ember backdrop-blur-sm transition-colors hover:border-cos-ember hover:bg-cos-ember/20"
          >
            🔄 Simulate New Onboarding
          </button>
        </div>
      )}

      {/* ─── PHASE 3: ONBOARDING (authenticated, preferences incomplete) ─── */}
      {appPhase === "onboarding" && (
        <>
          {/* Loading spinner until org is provisioned AND onboarding status resolves.
              Without activeOrg, the ChatPanel would send organizationId="" and Ossy
              would have no tools — the race condition that causes missing preference cards. */}
          {(!activeOrg?.id || onboardingLoading) ? (
            <div className="flex h-screen items-center justify-center bg-gradient-to-br from-cos-cloud to-[#e8e4dd]">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-cos-electric" />
                <p className="text-sm text-cos-slate">
                  {!activeOrg?.id ? "Setting up your workspace..." : "Loading your profile..."}
                </p>
              </div>
            </div>
          ) : (
            <div className="animate-fade-slide-in flex h-screen overflow-hidden bg-gradient-to-br from-cos-cloud to-[#e8e4dd]">
              {/* Center: Auth onboarding panel — enrichment + preference cards */}
              <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto bg-cos-cloud/60">
                <AuthOnboardingPanel
                  answeredCount={answeredCount}
                  totalRequired={totalRequired}
                />
              </main>

              {/* Right: Chat panel — desktop (authenticated onboarding mode) */}
              <aside className="hidden w-96 shrink-0 flex-col border-l border-cos-border/30 bg-cos-cloud/60 lg:flex">
                <ChatPanel
                  key={chatKey}
                  isGuest={false}
                  isOnboarding={true}
                  onRequestLogin={handleRequestLogin}
                />
              </aside>

              {/* Mobile: Floating Ossy button + full-screen chat overlay */}
              {!mobileChat && (
                <button
                  onClick={() => setMobileChat(true)}
                  className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-cos-electric text-white shadow-lg transition-transform hover:scale-105 lg:hidden"
                  aria-label="Open Ossy chat"
                >
                  <MessageCircle className="h-5 w-5" />
                </button>
              )}
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
                      isGuest={false}
                      isOnboarding={true}
                      onRequestLogin={handleRequestLogin}
                    />
                  </div>
                </div>
              )}

              {/* DEV: Simulate New Onboarding — bottom left */}
              <button
                onClick={handleSimulateNewUser}
                className="fixed bottom-6 left-6 z-40 rounded-cos-pill border border-cos-ember/40 bg-cos-ember/10 px-4 py-2 text-xs font-medium text-cos-ember backdrop-blur-sm transition-colors hover:border-cos-ember hover:bg-cos-ember/20"
              >
                Simulate New Onboarding
              </button>
            </div>
          )}
        </>
      )}

      {/* ─── PHASE 4: AUTHENTICATED (onboarding complete, full app access) ─── */}
      {appPhase === "authenticated" && (
        <div className="flex h-screen overflow-hidden bg-gradient-to-br from-cos-cloud to-[#e8e4dd]">
          {/* Left: Collapsible navigation */}
          <NavBar
            collapsed={navCollapsed}
            onToggle={() => setNavCollapsed(!navCollapsed)}
            isGuest={false}
            onRequestLogin={handleRequestLogin}
            onSimulateNewUser={handleSimulateNewUser}
          />

          {/* Center: Rich content area */}
          <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto bg-cos-cloud/60">
            {children}
          </main>

          {/* Right: Chat panel — desktop */}
          <aside className="hidden w-96 shrink-0 flex-col border-l border-cos-border/30 bg-cos-cloud/60 lg:flex">
            <ChatPanel
              key={chatKey}
              isGuest={false}
              onRequestLogin={handleRequestLogin}
            />
          </aside>

          {/* Mobile: Floating Ossy button + full-screen chat overlay */}
          {!mobileChat && (
            <button
              onClick={() => setMobileChat(true)}
              className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-cos-electric text-white shadow-lg transition-transform hover:scale-105 lg:hidden"
              aria-label="Open Ossy chat"
            >
              <MessageCircle className="h-5 w-5" />
            </button>
          )}
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
                  isGuest={false}
                  onRequestLogin={handleRequestLogin}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Login modal overlay (all phases) ─── */}
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
    </>
  );
}
