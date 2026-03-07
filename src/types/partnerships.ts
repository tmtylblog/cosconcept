/**
 * Partnership Types & Interfaces
 *
 * Defines the three partnership models and their data structures.
 */

// ─── Partnership Status Flow ────────────────────────────
// suggested → requested → accepted (Trusted Partner) → active
//                       → declined (can retry later)
//                       → inactive (expired or manually deactivated)

export type PartnershipStatus =
  | "suggested"
  | "requested"
  | "accepted"
  | "declined"
  | "inactive";

export type PartnershipType =
  | "trusted_partner"
  | "collective"
  | "vendor_network";

export type OpportunityStatus =
  | "open"
  | "shared"
  | "claimed"
  | "won"
  | "lost"
  | "expired";

export type OpportunitySource = "manual" | "call" | "email" | "ossy";

export type ReferralStatus = "pending" | "converted" | "lost";

// ─── Partnership ────────────────────────────────────────

export interface Partnership {
  id: string;
  firmAId: string;
  firmBId: string;
  status: PartnershipStatus;
  type: PartnershipType;
  initiatedBy?: string;
  matchScore?: number;
  matchExplanation?: string;
  notes?: string;
  acceptedAt?: Date | null;
  declinedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Populated by joins */
  firmA?: PartnerFirmSummary;
  firmB?: PartnerFirmSummary;
  partnerFirm?: PartnerFirmSummary;
  events?: PartnershipEvent[];
}

export interface PartnerFirmSummary {
  id: string;
  name: string;
  website?: string | null;
  description?: string | null;
  categories?: string[];
  topSkills?: string[];
  industries?: string[];
}

export interface PartnershipEvent {
  id: string;
  partnershipId: string;
  eventType: string;
  actorId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// ─── Opportunity ────────────────────────────────────────

export interface Opportunity {
  id: string;
  firmId: string;
  createdBy: string;
  title: string;
  description?: string | null;
  requiredSkills?: string[];
  requiredIndustries?: string[];
  estimatedValue?: string | null;
  timeline?: string | null;
  clientType?: string | null;
  source: OpportunitySource;
  status: OpportunityStatus;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Populated by joins */
  shares?: OpportunityShare[];
  suggestedPartners?: PartnerFirmSummary[];
}

export interface OpportunityShare {
  id: string;
  opportunityId: string;
  sharedWithFirmId: string;
  sharedBy: string;
  viewedAt?: Date | null;
  claimedAt?: Date | null;
  createdAt: Date;
  /** Populated by joins */
  firm?: PartnerFirmSummary;
}

// ─── Referral ───────────────────────────────────────────

export interface Referral {
  id: string;
  partnershipId?: string | null;
  opportunityId?: string | null;
  referringFirmId: string;
  receivingFirmId: string;
  status: ReferralStatus;
  estimatedValue?: string | null;
  actualValue?: string | null;
  convertedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── API Request/Response Types ─────────────────────────

export interface RequestPartnershipInput {
  targetFirmId: string;
  type?: PartnershipType;
  message?: string;
}

export interface RespondPartnershipInput {
  action: "accept" | "decline";
  message?: string;
}

export interface CreateOpportunityInput {
  title: string;
  description?: string;
  requiredSkills?: string[];
  requiredIndustries?: string[];
  estimatedValue?: string;
  timeline?: string;
  clientType?: string;
  source?: OpportunitySource;
}

export interface ShareOpportunityInput {
  firmIds: string[];
}

export interface CreateReferralInput {
  partnershipId?: string;
  opportunityId?: string;
  receivingFirmId: string;
  estimatedValue?: string;
}
