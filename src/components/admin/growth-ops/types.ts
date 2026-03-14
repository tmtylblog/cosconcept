// ── Growth Ops Shared Types ──────────────────────────────────────────────────

export interface Account {
  id: string;
  unipileAccountId: string;
  displayName: string;
  accountType: string;
  status: string;
}

export interface Conversation {
  id: string;
  chatId: string;
  participantName: string;
  participantHeadline: string | null;
  participantProfileUrl: string | null;
  participantAvatarUrl: string | null;
  participantProviderId: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  isInmailThread: boolean;
  /** Which account this conversation belongs to (for merged view) */
  _accountId?: string;
  _accountName?: string;
  /** Pipeline stage color dot */
  _stageColor?: string;
  /** Pipeline stage label */
  _stageLabel?: string;
}

export interface Message {
  id: string;
  text: string;
  is_sender: boolean;
  timestamp: string | null;
  seen?: boolean;
}

export interface SearchResult {
  provider_id?: string;
  public_identifier?: string;
  first_name?: string;
  last_name?: string;
  headline?: string;
  profile_picture_url?: string;
}

export interface Usage {
  accountType: string;
  accountTypeLabel: string;
  today: {
    invitesSent: number;
    messagesSent: number;
    inmailsSent: number;
    profileViews: number;
  };
  limits: {
    dailyInvites: number;
    dailyMessages: number;
    monthlyInmails: number;
  };
}

export interface QueueItem {
  id: string;
  contactEmail: string | null;
  contactName: string | null;
  contactLinkedinUrl: string | null;
  companyName: string | null;
  source: string;
  sourceChannel: string;
  sourceCampaignName: string | null;
  messageText: string | null;
  sentiment: string | null;
  sentimentScore: number | null;
  status: string;
  createdAt: string;
}

export interface Stage {
  id: string;
  label: string;
  displayOrder: number;
  color: string;
  isClosedWon: boolean;
  isClosedLost: boolean;
}

export interface DealCustomFields {
  tags?: string[];
}

export interface Deal {
  id: string;
  name: string;
  stageId: string | null;
  stageLabel: string;
  dealValue: string | null;
  status: string;
  source: string;
  sourceChannel: string | null;
  sourceCampaignName: string | null;
  notes: string | null;
  priority: string;
  lastActivityAt: string | null;
  sentimentScore: number | null;
  hubspotDealId: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customFields: DealCustomFields | null;
}

export interface Contact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  linkedinUrl: string | null;
  companyId: string | null;
}

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  sizeEstimate: string | null;
}

export interface Activity {
  id: string;
  activityType: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ConversationContext {
  contact: Contact | null;
  deal: Deal | null;
  company: Company | null;
  stages: Stage[];
  activities: Activity[];
  outreach: {
    channel: string | null;
    campaignName: string | null;
    firstTouchAt: string | null;
    responseAt: string | null;
  } | null;
}
