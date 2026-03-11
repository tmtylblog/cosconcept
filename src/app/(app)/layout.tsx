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
import { ProfileProvider, useProfile } from "@/hooks/use-profile";
import { GuestDataProvider, useGuestData } from "@/hooks/use-guest-data";
import { useOnboardingStatus } from "@/hooks/use-onboarding-status";
import { authClient, useSession, useActiveOrganization } from "@/lib/auth-client";
import { getEmailDomain, isPersonalEmail } from "@/lib/email-validation";
import { MessageCircle, X, Loader2, Sparkles, Building, CheckCircle2 } from "lucide-react";

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
// Phase 3b: brand_waitlist — authenticated brand/client, skips onboarding
// Phase 4: authenticated — onboarding complete, full app access
type AppPhase = "landing" | "enriching" | "onboarding" | "brand_waitlist" | "authenticated";

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
  const { data: session } = useSession();

  return (
    <EnrichmentProvider organizationId={activeOrg?.id}>
      <ProfileProvider organizationId={activeOrg?.id} isAuthenticated={!!session?.user}>
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
  const { data: session, isPending: sessionPending } = useSession();
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

  const [navCollapsed, setNavCollapsed] = useState(false);
  const [loginPanelOpen, setLoginPanelOpen] = useState(false);
  const [chatKey, setChatKey] = useState(0);
  const [mobileChat, setMobileChat] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [domainClaimed, setDomainClaimed] = useState<{
    orgName: string;
    ownerEmailMasked: string;
  } | null>(null);

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

          // Check if another user has already claimed this domain
          try {
            const checkRes = await fetch("/api/onboarding/check-domain", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ domain }),
            });
            if (checkRes.ok) {
              const checkData = await checkRes.json();
              if (checkData.claimed) {
                console.log(`[Layout] Domain ${domain} already claimed by ${checkData.ownerEmailMasked}`);
                setDomainClaimed({
                  orgName: checkData.orgName,
                  ownerEmailMasked: checkData.ownerEmailMasked,
                });
                orgProvisionedRef.current = false;
                return;
              }
            }
          } catch {
            // If check fails, proceed anyway
          }

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

  // ─── Profile hydration state ────────────────────────────
  const { hydrated: profileHydrated } = useProfile();

  // ─── Onboarding status (authenticated users only) ─────────
  const {
    onboardingComplete,
    isLoading: onboardingLoading,
    answeredCount,
    totalRequired,
    missingFields,
    isBrandWaitlist,
  } = useOnboardingStatus(activeOrg?.id, !!session?.user);

  // Track onboarding completion — distinguish initial page load from in-session transition.
  // On page reload of an already-complete account, skip celebration and go straight to app.
  // On genuine in-session completion (user answers all 9 questions), show celebration + trigger deep crawl.
  const onboardingLoadedRef = useRef(false); // has the first API response arrived?
  const prevOnboardingCompleteRef = useRef<boolean | null>(null);
  const deepCrawlTriggeredRef = useRef(false);

  useEffect(() => {
    // Wait for onboarding status to finish its initial load
    if (onboardingLoading) return;

    // First time we get a non-loading state — this is the "initial load" result
    if (!onboardingLoadedRef.current) {
      onboardingLoadedRef.current = true;
      prevOnboardingCompleteRef.current = onboardingComplete;
      // No celebration on initial page load — just show whatever phase is correct
      return;
    }

    // After initial load: detect genuine false→true transition
    if (prevOnboardingCompleteRef.current === false && onboardingComplete === true) {
      // Onboarding just completed IN THIS SESSION — show celebration
      setShowCelebration(true);
      setChatKey((k) => k + 1); // Fresh ChatPanel mount for greeting

      // ── Auto-trigger deep crawl ────────────────────────────
      // This kicks off the full pipeline: deep crawl → AI extraction → bulk case study + service creation → graph write
      // The profile pages will be fully populated by the time the user navigates there.
      if (!deepCrawlTriggeredRef.current && activeOrg?.id) {
        deepCrawlTriggeredRef.current = true;
        const domain = enrichmentResult?.domain;
        const orgName = enrichmentResult?.companyData?.name || activeOrg?.name;
        console.log(`[Layout] Triggering deep crawl for ${orgName} (${domain || "resolving from DB..."})`);
        fetch("/api/enrich/deep-crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId: activeOrg.id,
            website: domain,
            firmName: orgName,
          }),
        }).catch((err) => {
          console.error("[Layout] Failed to trigger deep crawl:", err);
          deepCrawlTriggeredRef.current = false;
        });
      }

      // Celebration shows for 2.5s while authenticated layout loads behind it
      const timer = setTimeout(() => {
        setShowCelebration(false);
        router.push("/discover");
      }, 2500);
      prevOnboardingCompleteRef.current = onboardingComplete;
      return () => clearTimeout(timer);
    }

    prevOnboardingCompleteRef.current = onboardingComplete;
  }, [onboardingComplete, onboardingLoading, activeOrg?.id, activeOrg?.name, enrichmentResult?.domain, enrichmentResult?.companyData?.name]);

  // ─── Derive firm section from pathname ──────────────────────
  const firmSection: string | null =
    pathname === "/firm" ? "overview"
    : pathname === "/firm/offering" ? "offering"
    : pathname === "/firm/experts" ? "experts"
    : pathname === "/firm/experience" ? "experience"
    : pathname === "/firm/preferences" ? "preferences"
    : pathname.startsWith("/firm/case-studies") ? "experience"
    : null;

  // ─── Derive app phase (5 states) ──────────────────────────
  const appPhase: AppPhase = !session?.user
    ? (enrichmentStatus === "idle" ? "landing" : "enriching")
    : isBrandWaitlist
      ? "brand_waitlist"
      : onboardingComplete
        ? "authenticated"
        : "onboarding";

  // ─── Auto-enrich on sign-in: extract domain from email ──────
  // Handles domain aliases (e.g., email is @chameleon.co but firm website is chameleoncollective.com).
  // If enrichment data already exists for a domain that the email domain redirects to, skip re-enrichment.
  const enrichTriggeredRef = useRef<string | null>(null);
  // Keep triggerEnrichment in a ref to avoid it as an effect dependency (its identity changes)
  const triggerEnrichmentRef = useRef(triggerEnrichment);
  triggerEnrichmentRef.current = triggerEnrichment;

  // Stable primitive deps for the auto-enrich effect
  const hasCompanyData = !!enrichmentResult?.companyData;
  const enrichedDomain = enrichmentResult?.domain;

  useEffect(() => {
    if (!session?.user?.email) return;
    if (enrichTriggeredRef.current === session.user.email) return;

    const emailDomain = getEmailDomain(session.user.email);
    if (!emailDomain || isPersonalEmail(session.user.email)) return;

    // If enrichment is already done with company data, check if the email domain
    // is an alias for the enriched domain (e.g., chameleon.co → chameleoncollective.com)
    if (enrichmentStatus === "done" && hasCompanyData) {
      // Already enriched — domains might differ but that's fine (alias case)
      enrichTriggeredRef.current = session.user.email;
      if (enrichedDomain && enrichedDomain !== emailDomain) {
        console.log(
          `[Layout] Skipping auto-enrich: email domain (${emailDomain}) differs from enriched domain (${enrichedDomain}), likely an alias`
        );
      }
      return;
    }

    // If enrichment is loading, wait for it
    if (enrichmentStatus === "loading") return;

    // Need enrichment — either idle (no data) or done but missing company data
    const needsEnrichment =
      enrichmentStatus === "idle" ||
      (enrichmentStatus === "done" && !hasCompanyData);

    if (needsEnrichment) {
      enrichTriggeredRef.current = session.user.email;
      const isGapFill = enrichmentStatus === "done";
      console.log(
        `[Layout] Auto-enriching from email domain: ${emailDomain}` +
        (isGapFill ? " (gap-fill: missing PDL data)" : "")
      );
      triggerEnrichmentRef.current(emailDomain, isGapFill);
    }
  }, [session?.user?.email, enrichmentStatus, hasCompanyData, enrichedDomain]);

  // ─── Guest-to-auth data migration ──────────────────────────
  const migrationDoneRef = useRef(false);
  // Keep guestPreferences in a ref to avoid the object as an effect dependency
  const guestPrefsRef = useRef(guestPreferences);
  guestPrefsRef.current = guestPreferences;

  useEffect(() => {
    if (!session?.user || !activeOrg?.id || !hasGuestData || migrationDoneRef.current) return;
    migrationDoneRef.current = true;

    async function migrateGuestData() {
      try {
        const prefs = guestPrefsRef.current;
        const prefKeys = Object.keys(prefs);
        if (prefKeys.length > 0) {
          console.log(`[Layout] Migrating ${prefKeys.length} guest preferences...`);
          const res = await fetch("/api/onboarding/migrate-preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              organizationId: activeOrg!.id,
              preferences: prefs,
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
  }, [session?.user, activeOrg?.id, hasGuestData, clearGuestData]);

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

  // ─── Session loading gate ──────────────────────────────────
  // While Better Auth is resolving the session cookie (isPending),
  // show a loading screen to prevent flashing the guest layout
  // for authenticated users on page reload or post-signup redirect.
  if (sessionPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-cos-cloud to-[#e8e4dd]">
        <div className="flex flex-col items-center gap-3">
          <Image
            src="/logo.png"
            alt="Collective OS"
            width={48}
            height={48}
            className="h-12 w-12 animate-pulse rounded-cos-xl"
          />
          <p className="text-sm text-cos-slate">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ─── PHASE 1: LANDING (guest, no domain yet) ─── */}
      {appPhase === "landing" && (
        <div className="flex h-screen overflow-hidden bg-gradient-to-br from-cos-cloud to-[#e8e4dd]">
          {/* Center: Welcome content — directs users to chat or login */}
          <main className="relative flex min-w-0 flex-1 flex-col items-center justify-center bg-cos-cloud/60 px-8">
            <div className="w-full max-w-md text-center">
              {/* Logo + branding */}
              <Image
                src="/logo.png"
                alt="Collective OS"
                width={64}
                height={64}
                className="mx-auto h-16 w-16 rounded-cos-xl"
              />
              <h1 className="mt-4 font-heading text-2xl font-bold text-cos-midnight">
                Collective OS
              </h1>
              <p className="mt-1 text-sm text-cos-slate">
                Grow Faster Together
              </p>

              {/* Value proposition */}
              <p className="mt-6 text-sm leading-relaxed text-cos-slate">
                The operating system for partnership-led growth.
                Find, match, and manage the right partners for your
                professional services firm.
              </p>

              {/* CTA: direct to chat */}
              <div className="mt-8 rounded-cos-xl border border-cos-electric/20 bg-cos-electric/5 px-6 py-5">
                <div className="flex items-center justify-center gap-2 text-cos-electric">
                  <MessageCircle className="h-5 w-5" />
                  <span className="text-sm font-semibold">Get Started</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-cos-slate">
                  Enter your company domain in the chat to get an instant
                  profile — we&apos;ll discover your services, team, and more.
                </p>
              </div>

              {/* Login link */}
              <button
                onClick={handleRequestLogin}
                className="mt-6 text-sm text-cos-electric transition-colors hover:underline"
              >
                Already have an account? Sign in
              </button>
            </div>

            {/* DEV: Simulate New Onboarding — bottom left */}
            <button
              onClick={handleSimulateNewUser}
              className="absolute bottom-6 left-6 rounded-cos-pill border border-cos-ember/40 bg-cos-ember/10 px-4 py-2 text-xs font-medium text-cos-ember transition-colors hover:border-cos-ember hover:bg-cos-ember/20"
            >
              🔄 Simulate New Onboarding
            </button>
          </main>

          {/* Right: Chat panel — matches enriching/authenticated layout */}
          <aside className="hidden w-96 shrink-0 flex-col border-l border-cos-midnight/20 lg:flex">
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
          <aside className="hidden w-96 shrink-0 flex-col border-l border-cos-midnight/20 lg:flex">
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
          {/* Brief loading spinner while first onboarding status API call resolves.
              Server-side fallback resolves organizationId from user's membership
              when activeOrg is not yet available on the client. */}
          {onboardingLoading ? (
            <div className="flex h-screen items-center justify-center bg-gradient-to-br from-cos-cloud to-[#e8e4dd]">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-cos-electric" />
                <p className="text-sm text-cos-slate">Loading your profile...</p>
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

              {/* Right: Chat panel — desktop (authenticated onboarding mode)
                  Delayed until profile is hydrated so ChatPanel knows which
                  question to start with. Shows a "reviewing" placeholder first. */}
              <aside className="hidden w-96 shrink-0 flex-col border-l border-cos-midnight/20 lg:flex">
                {profileHydrated ? (
                  <ChatPanel
                    key={chatKey}
                    isGuest={false}
                    isOnboarding={true}
                    missingFields={missingFields}
                    answeredCount={answeredCount}
                    onRequestLogin={handleRequestLogin}
                  />
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
                    <Image
                      src="/logo.png"
                      alt="Ossy"
                      width={40}
                      height={40}
                      className="h-10 w-10 animate-pulse rounded-cos-xl"
                    />
                    <p className="text-center text-sm text-cos-slate-dim">
                      Ossy is reviewing your profile…
                    </p>
                  </div>
                )}
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
                    {profileHydrated ? (
                      <ChatPanel
                        key={chatKey}
                        isGuest={false}
                        isOnboarding={true}
                        missingFields={missingFields}
                        answeredCount={answeredCount}
                        onRequestLogin={handleRequestLogin}
                      />
                    ) : (
                      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
                        <Image
                          src="/logo.png"
                          alt="Ossy"
                          width={40}
                          height={40}
                          className="h-10 w-10 animate-pulse rounded-cos-xl"
                        />
                        <p className="text-center text-sm text-cos-slate-dim">
                          Ossy is reviewing your profile…
                        </p>
                      </div>
                    )}
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

      {/* ─── PHASE 3b: BRAND WAITLIST (brand/client entity, no onboarding needed) ─── */}
      {appPhase === "brand_waitlist" && (
        <div className="flex h-screen items-center justify-center bg-gradient-to-br from-cos-cloud to-[#e8e4dd]">
          <div className="mx-auto w-full max-w-md px-6">
            <div className="rounded-cos-2xl border border-cos-warm/30 bg-white/80 px-8 py-10 text-center shadow-lg backdrop-blur-sm">
              {/* Icon */}
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-cos-warm/15">
                <Building className="h-7 w-7 text-cos-warm" />
              </div>

              {/* Title */}
              <h2 className="font-heading text-xl font-bold text-cos-midnight">
                Thanks for registering!
              </h2>

              {/* Subtitle */}
              <p className="mt-3 text-sm leading-relaxed text-cos-slate">
                Collective OS is currently built for service providers — agencies,
                consultancies, and fractional leaders — to find and partner with each other.
              </p>

              {/* Value prop */}
              <div className="mt-6 rounded-cos-xl border border-cos-signal/20 bg-cos-signal/5 px-5 py-4">
                <p className="text-sm font-medium text-cos-midnight">
                  Brand &amp; Client Matching — Coming Soon
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-cos-slate">
                  We&apos;re building a way for brands and product companies to find
                  vetted service providers through Collective OS. You&apos;re on the list!
                </p>
              </div>

              {/* Confirmation */}
              <div className="mt-6 flex items-center justify-center gap-2 text-sm text-cos-signal">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">Your interest has been registered</span>
              </div>

              {/* Sign out */}
              <button
                onClick={() => {
                  authClient.signOut().then(() => {
                    window.location.href = "/";
                  });
                }}
                className="mt-8 text-xs text-cos-slate-dim underline transition-colors hover:text-cos-midnight"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
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
          <aside className="hidden w-96 shrink-0 flex-col border-l border-cos-midnight/20 lg:flex">
            <ChatPanel
              key={chatKey}
              isGuest={false}
              firmSection={firmSection}
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
                  firmSection={firmSection}
                  onRequestLogin={handleRequestLogin}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Domain claimed overlay (org already registered by someone else) ─── */}
      {domainClaimed && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-cos-cloud/95 backdrop-blur-md">
          <div className="mx-auto w-full max-w-md px-6">
            <div className="rounded-cos-2xl border border-cos-warm/30 bg-white/80 px-8 py-10 text-center shadow-lg backdrop-blur-sm">
              {/* Icon */}
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-cos-warm/15">
                <Building className="h-7 w-7 text-cos-warm" />
              </div>

              {/* Title */}
              <h2 className="font-heading text-xl font-bold text-cos-midnight">
                Account Already Registered
              </h2>

              {/* Message */}
              <p className="mt-3 text-sm leading-relaxed text-cos-slate">
                Someone from <span className="font-semibold text-cos-midnight">{domainClaimed.orgName}</span> has
                already registered this company on Collective OS.
              </p>

              {/* Owner email */}
              <div className="mt-4 rounded-cos-xl border border-cos-border/50 bg-cos-cloud/50 px-5 py-3">
                <p className="text-xs text-cos-slate-dim">Registered by</p>
                <p className="mt-1 text-sm font-medium text-cos-midnight">
                  {domainClaimed.ownerEmailMasked}
                </p>
              </div>

              {/* Action */}
              <p className="mt-4 text-xs leading-relaxed text-cos-slate">
                Please contact them to be added to the account, or reach out to{" "}
                <a href="mailto:support@joincollectiveos.com" className="text-cos-electric underline">
                  support@joincollectiveos.com
                </a>{" "}
                for help.
              </p>

              {/* Sign out */}
              <button
                onClick={() => {
                  authClient.signOut().then(() => {
                    window.location.href = "/";
                  });
                }}
                className="mt-6 rounded-cos-pill border border-cos-border px-6 py-2 text-xs font-medium text-cos-slate transition-colors hover:border-cos-midnight hover:text-cos-midnight"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Celebration overlay (onboarding → authenticated transition) ─── */}
      {showCelebration && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-cos-cloud/95 backdrop-blur-md">
          <div className="animate-fade-slide-in flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cos-signal/20">
              <Sparkles className="h-8 w-8 text-cos-signal" />
            </div>
            <h2 className="font-heading text-xl font-bold text-cos-midnight">
              You&apos;re all set!
            </h2>
            <p className="text-sm text-cos-slate">
              Unlocking your dashboard...
            </p>
          </div>
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
