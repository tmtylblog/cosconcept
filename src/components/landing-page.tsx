"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Handshake,
  Brain,
  Building2,
  Zap,
  ArrowRight,
  MessageSquare,
  Globe,
  Users,
  ChevronRight,
} from "lucide-react";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cos-cloud to-[#e8e4dd]">
      {/* ─── Nav ─── */}
      <nav className="flex items-center justify-between px-6 py-4 md:px-12 md:py-6">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Collective OS"
            width={36}
            height={36}
            className="h-9 w-9 rounded-cos-lg"
          />
          <span className="font-heading text-lg font-bold text-cos-midnight">
            Collective OS
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-cos-midnight hover:text-cos-electric transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="rounded-cos-pill bg-cos-electric px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-cos-electric-hover"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="mx-auto max-w-5xl px-6 pb-16 pt-12 text-center md:px-12 md:pt-20">
        <div className="mb-6 inline-flex items-center gap-2 rounded-cos-pill border border-cos-border bg-white/70 px-4 py-1.5 text-xs font-medium text-cos-slate backdrop-blur">
          <Zap className="h-3.5 w-3.5 text-cos-electric" />
          AI-powered partnership intelligence
        </div>

        <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight text-cos-midnight md:text-5xl lg:text-6xl">
          Grow Faster
          <span className="text-cos-electric"> Together</span>
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-cos-slate md:text-xl">
          The operating system for partnership-led growth. Find complementary
          firms, build strategic alliances, and unlock revenue you can&apos;t
          reach alone.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-cos-pill bg-cos-electric px-7 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-cos-electric-hover"
          >
            Try Ossy Free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="flex items-center gap-2 rounded-cos-pill border border-cos-border bg-white px-7 py-3 text-sm font-semibold text-cos-midnight shadow-sm transition-colors hover:border-cos-electric hover:text-cos-electric"
          >
            Sign in
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <p className="mt-4 text-xs text-cos-slate-light">
          No credit card required. Corporate email only.
        </p>
      </section>

      {/* ─── How It Works ─── */}
      <section className="mx-auto max-w-5xl px-6 pb-20 md:px-12">
        <h2 className="mb-3 text-center font-heading text-2xl font-bold text-cos-midnight md:text-3xl">
          Partnership growth, simplified
        </h2>
        <p className="mx-auto mb-12 max-w-xl text-center text-sm text-cos-slate">
          Collective OS handles the hard parts of finding, evaluating, and
          managing strategic partnerships so you can focus on delivery.
        </p>

        <div className="grid gap-5 md:grid-cols-3">
          <FeatureCard
            icon={<MessageSquare className="h-5 w-5" />}
            title="Talk to Ossy"
            description="Our AI consultant learns your firm, services, and growth goals through natural conversation — no forms, no setup wizards."
          />
          <FeatureCard
            icon={<Brain className="h-5 w-5" />}
            title="Smart Matching"
            description="We analyze what firms have actually done — case studies, clients, verified work — not just what they claim they can do."
          />
          <FeatureCard
            icon={<Handshake className="h-5 w-5" />}
            title="Grow Together"
            description="Find complementary partners, not competitors. Subcontracting, co-delivery, referral — structured for real outcomes."
          />
        </div>
      </section>

      {/* ─── Built For ─── */}
      <section className="border-t border-cos-border/50 bg-white/40 backdrop-blur">
        <div className="mx-auto max-w-5xl px-6 py-16 md:px-12">
          <h2 className="mb-10 text-center font-heading text-2xl font-bold text-cos-midnight">
            Built for professional services
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FirmTypeCard
              icon={<Building2 className="h-5 w-5" />}
              label="Agencies"
              detail="Creative, digital, performance marketing"
            />
            <FirmTypeCard
              icon={<Users className="h-5 w-5" />}
              label="Consultancies"
              detail="Strategy, management, technology"
            />
            <FirmTypeCard
              icon={<Globe className="h-5 w-5" />}
              label="Fractional Leaders"
              detail="CMOs, CTOs, CFOs, COOs"
            />
            <FirmTypeCard
              icon={<Zap className="h-5 w-5" />}
              label="Service Providers"
              detail="Dev shops, MSPs, staff aug"
            />
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center md:px-12">
        <div className="rounded-cos-2xl border border-cos-border bg-white p-8 shadow-sm md:p-12">
          <h2 className="font-heading text-2xl font-bold text-cos-midnight md:text-3xl">
            Ready to find your next partner?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-cos-slate">
            Start a conversation with Ossy — our AI growth consultant will learn
            about your firm and start surfacing partnership opportunities in
            minutes.
          </p>
          <div className="mt-6">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-cos-pill bg-cos-electric px-7 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-cos-electric-hover"
            >
              Start Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-cos-border/40 px-6 py-8 md:px-12">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Collective OS"
              width={24}
              height={24}
              className="h-6 w-6 rounded-cos-sm"
            />
            <span className="font-heading text-sm font-semibold text-cos-midnight">
              Collective OS
            </span>
          </div>
          <p className="text-xs text-cos-slate-light">
            joincollectiveos.com
          </p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-cos-xl border border-cos-border bg-white p-6 shadow-sm">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-cos-lg bg-cos-electric/10 text-cos-electric">
        {icon}
      </div>
      <h3 className="font-heading text-sm font-semibold text-cos-midnight">
        {title}
      </h3>
      <p className="mt-1.5 text-xs leading-relaxed text-cos-slate">
        {description}
      </p>
    </div>
  );
}

function FirmTypeCard({
  icon,
  label,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-cos-xl border border-cos-border/60 bg-white/60 p-4 backdrop-blur">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-cos-md bg-cos-midnight/5 text-cos-midnight">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-cos-midnight">{label}</p>
        <p className="text-[11px] text-cos-slate">{detail}</p>
      </div>
    </div>
  );
}
