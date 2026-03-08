export interface DirectoryFirm {
  id: string;
  name: string;
  source: "platform" | "imported" | "neo4j";
  website: string | null;
  description: string | null;
  firmType: string | null;
  sizeBand: string | null;
  industry: string | null;
  categories: string[];
  industries: string[];
  markets: string[];
  foundedYear: number | null;
  employeeCount: number | null;
  expertCount: number | null;
  clientCount: number | null;
  caseStudyCount: number | null;
}

export interface ExpertContact {
  id: string;
  sourceId: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string | null;
  title: string | null;
  expertClassification: string | null;
  photoUrl: string | null;
  linkedinUrl: string | null;
  headline: string | null;
  shortBio: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  isPartner: boolean | null;
  isIcp: boolean | null;
  reviewTags: string[];
  createdAt: string;
  company: { id: string; name: string; domain: string | null } | null;
}

export interface ImportedClient {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  location: string | null;
  serviceFirmCount: number;
  caseStudyCount: number;
}

export interface CaseStudyRecord {
  id: string;
  sourceId: string | null;
  content: string | null;
  authorOrgName: string | null;
  status: string;
  clientCompanies: { id: string; name: string }[] | null;
  industries: { id: string; name: string }[] | null;
  skills: { id: string; name: string }[] | null;
  markets: string[] | null;
  expertUsers: { id: string; name: string }[] | null;
  createdAt: string;
}

export interface SolutionPartner {
  id: string;
  name: string;
  domain: string;
  category: string | null;
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  isVerified: boolean;
  createdAt: string;
}

export interface AttributeItem {
  name: string;
  count: number;
}
