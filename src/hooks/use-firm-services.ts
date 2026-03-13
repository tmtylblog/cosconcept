"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────

export interface FirmService {
  id: string;
  name: string;
  description: string | null;
  sourceUrl: string | null;
  sourcePageTitle: string | null;
  subServices: string[] | null;
  isHidden: boolean;
  displayOrder: number;
  createdAt: string;
}

interface UseFirmServicesReturn {
  services: FirmService[];
  total: number;
  hiddenCount: number;
  isLoading: boolean;
  toggleHidden: (id: string) => Promise<void>;
  updateDescription: (id: string, description: string) => Promise<void>;
  addService: (name: string, description?: string) => Promise<void>;
  deleteService: (id: string) => Promise<void>;
  refresh: () => void;
}

// ─── Hook ─────────────────────────────────────────────────

export function useFirmServices(
  organizationId: string | undefined,
  options?: { includeHidden?: boolean }
): UseFirmServicesReturn {
  const [services, setServices] = useState<FirmService[]>([]);
  const [total, setTotal] = useState(0);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const includeHidden = options?.includeHidden ?? true;

  // ── Fetch all services ────────────────────────────────
  const fetchServices = useCallback(async () => {
    if (!organizationId) return;
    try {
      const params = new URLSearchParams({ organizationId });
      if (includeHidden) params.set("includeHidden", "true");

      const res = await fetch(`/api/firm/services?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setServices(data.services ?? []);
      setTotal(data.total ?? 0);
      setHiddenCount(data.hiddenCount ?? 0);
    } catch {
      // silent
    }
  }, [organizationId, includeHidden]);

  // ── Initial load ──────────────────────────────────────
  useEffect(() => {
    if (!organizationId) {
      setServices([]);
      setTotal(0);
      setHiddenCount(0);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const params = new URLSearchParams({ organizationId });
    if (includeHidden) params.set("includeHidden", "true");

    fetch(`/api/firm/services?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(async (data) => {
        if (cancelled) return;
        setServices(data?.services ?? []);
        setTotal(data?.total ?? 0);
        setHiddenCount(data?.hiddenCount ?? 0);
        setIsLoading(false);

        // Retry polling if initial fetch returns 0 services (enrichment may still be running)
        if ((data?.services ?? []).length === 0) {
          const retryDelays = [2000, 5000, 10000];
          for (const delay of retryDelays) {
            if (cancelled) break;
            await new Promise((r) => setTimeout(r, delay));
            if (cancelled) break;
            try {
              const retryRes = await fetch(`/api/firm/services?${params}`);
              if (!retryRes.ok || cancelled) continue;
              const retryData = await retryRes.json();
              if (cancelled) break;
              if ((retryData?.services ?? []).length > 0) {
                setServices(retryData.services);
                setTotal(retryData.total ?? 0);
                setHiddenCount(retryData.hiddenCount ?? 0);
                break;
              }
            } catch {
              // silent
            }
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId, includeHidden]);

  // ── Toggle hidden ─────────────────────────────────────
  const toggleHidden = useCallback(
    async (id: string) => {
      if (!organizationId) return;
      const service = services.find((s) => s.id === id);
      if (!service) return;

      const newHidden = !service.isHidden;

      // Optimistic update
      setServices((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isHidden: newHidden } : s))
      );

      try {
        const res = await fetch("/api/firm/services", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, organizationId, isHidden: newHidden }),
        });
        if (!res.ok) {
          // Revert on failure
          setServices((prev) =>
            prev.map((s) => (s.id === id ? { ...s, isHidden: !newHidden } : s))
          );
        }
      } catch {
        // Revert on error
        setServices((prev) =>
          prev.map((s) => (s.id === id ? { ...s, isHidden: !newHidden } : s))
        );
      }
    },
    [organizationId, services]
  );

  // ── Update description ────────────────────────────────
  const updateDescription = useCallback(
    async (id: string, description: string) => {
      if (!organizationId) return;

      // Optimistic update
      setServices((prev) =>
        prev.map((s) => (s.id === id ? { ...s, description } : s))
      );

      try {
        const res = await fetch("/api/firm/services", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, organizationId, description }),
        });
        if (!res.ok) {
          // Refresh to get correct state on failure
          await fetchServices();
        }
      } catch {
        await fetchServices();
      }
    },
    [organizationId, fetchServices]
  );

  // ── Add service manually ──────────────────────────────
  const addService = useCallback(
    async (name: string, description?: string) => {
      if (!organizationId) return;
      const res = await fetch("/api/firm/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, name, description }),
      });
      if (res.ok) {
        await fetchServices();
      }
    },
    [organizationId, fetchServices]
  );

  // ── Delete a manually-added service ───────────────────
  const deleteService = useCallback(
    async (id: string) => {
      if (!organizationId) return;
      // Optimistic remove
      setServices((prev) => prev.filter((s) => s.id !== id));
      setTotal((t) => Math.max(0, t - 1));

      const res = await fetch(
        `/api/firm/services?id=${id}&organizationId=${organizationId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        await fetchServices();
      }
    },
    [organizationId, fetchServices]
  );

  return {
    services,
    total,
    hiddenCount,
    isLoading,
    toggleHidden,
    updateDescription,
    addService,
    deleteService,
    refresh: fetchServices,
  };
}
