export interface EnvironmentIntelligenceFormInput {
  type: string | null;
  name: string | null;
  label: string | null;
  required: boolean;
}

export interface EnvironmentIntelligenceForm {
  method: string | null;
  action: string | null;
  inputs: EnvironmentIntelligenceFormInput[];
}

export interface EnvironmentIntelligenceButton {
  text: string;
  type: string | null;
}

export interface EnvironmentIntelligenceLink {
  text: string;
  href: string | null;
}

export interface EnvironmentIntelligenceContext {
  provider: 'OXYLABS';
  status: 'COMPLETED' | 'FAILED' | 'UNAVAILABLE';
  sourceUrl: string;
  finalUrl: string;
  sourceDomain: string;
  targetStatusCode: number;
  rendered: boolean;
  title: string | null;
  headings: string[];
  forms: EnvironmentIntelligenceForm[];
  buttons: EnvironmentIntelligenceButton[];
  links: EnvironmentIntelligenceLink[];
  visibleTextSummary: string;
  detectedJourneys: string[];
  jobId: string | null;
  durationMs: number;
  retrievedAt: string;
  usedByPlanner?: boolean;
  errorCategory?: string;
}

export interface EnvironmentIntelligenceSummary {
  provider: 'OXYLABS';
  status: 'COMPLETED' | 'FAILED' | 'UNAVAILABLE';
  sourceDomain: string;
  rendered: boolean;
  title: string | null;
  headingCount: number;
  formCount: number;
  inputCount: number;
  buttonCount: number;
  linkCount: number;
  detectedJourneys: string[];
  durationMs: number;
  usedByPlanner: boolean;
  retrievedAt: string;
}
