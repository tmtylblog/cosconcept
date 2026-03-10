import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/enrich/resolve-domain?domain=chameleon.co
 *
 * Lightweight endpoint that follows HTTP redirects to discover domain aliases.
 * E.g., chameleon.co → chameleoncollective.com
 *
 * Used by the client-side auto-enrich logic to detect when an email domain
 * (e.g., @chameleon.co) maps to an already-enriched website domain
 * (e.g., chameleoncollective.com), preventing duplicate enrichment.
 *
 * Returns:
 *   { domain: "chameleon.co", resolvedDomain: "chameleoncollective.com" }
 *   { domain: "chameleon.co", resolvedDomain: null }  // no redirect detected
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain")?.toLowerCase();

  if (!domain) {
    return NextResponse.json({ error: "domain parameter required" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`https://${domain}`, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CollectiveOS/1.0)",
      },
    });
    clearTimeout(timeout);

    const finalUrl = res.url;
    if (!finalUrl) {
      return NextResponse.json({ domain, resolvedDomain: null });
    }

    const finalHost = new URL(finalUrl).hostname.replace(/^www\./, "").toLowerCase();

    if (finalHost !== domain) {
      console.log(`[ResolveDomain] ${domain} → ${finalHost}`);
      return NextResponse.json({ domain, resolvedDomain: finalHost });
    }

    return NextResponse.json({ domain, resolvedDomain: null });
  } catch (err) {
    console.log(`[ResolveDomain] Failed for ${domain}:`, (err as Error)?.message);
    return NextResponse.json({ domain, resolvedDomain: null });
  }
}
