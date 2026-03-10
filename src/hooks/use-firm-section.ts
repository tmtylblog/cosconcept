"use client";

import { createContext, useContext } from "react";

export type FirmSection = "overview" | "offering" | "experts" | "experience" | "preferences" | null;

const FirmSectionContext = createContext<FirmSection>(null);

export const FirmSectionProvider = FirmSectionContext.Provider;

export function useFirmSection(): FirmSection {
  return useContext(FirmSectionContext);
}
