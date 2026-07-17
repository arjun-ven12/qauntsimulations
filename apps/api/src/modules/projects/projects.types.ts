import type { UserRole } from '@taskos/shared-types';

export const HTTP_METHODS = ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'] as const;
export type AllowedHttpMethod = (typeof HTTP_METHODS)[number];

export interface EndpointReference {
  label: string;
  url: string;
}

export interface CredentialReferenceInput {
  label: string;
  reference: string;
}

export interface ProjectSafetyConfiguration {
  version: 1;
  applicationUrl: string;
  apiEndpoints: EndpointReference[];
  webhookEndpoints: EndpointReference[];
  allowedHttpMethods: AllowedHttpMethod[];
  permitCheckoutSubmission: boolean;
  permitMockPayment: boolean;
  permitTestOrderCreation: boolean;
  restrictions: {
    testEnvironmentsOnly: true;
    productionAccess: false;
    realPayments: false;
    destructiveAccountActions: false;
    externalDataExport: false;
    realCustomerChanges: false;
    externalMessaging: false;
    repositoryDeletion: false;
    infrastructureChanges: false;
    crossOrganisationAccess: false;
    unknownDomains: false;
  };
  acknowledgedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description: string | null;
  applicationUrl: string;
  repositoryUrl: string | null;
  credentialReferences: CredentialReferenceInput[];
  apiEndpoints: EndpointReference[];
  webhookEndpoints: EndpointReference[];
  prohibitedActions: string[];
  acknowledgement: true;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  applicationUrl?: string;
  repositoryUrl?: string | null;
  credentialReferences?: CredentialReferenceInput[];
  apiEndpoints?: EndpointReference[];
  webhookEndpoints?: EndpointReference[];
}

export interface UpdateSafetyInput {
  domainAllowlist: string[];
  allowedHttpMethods: AllowedHttpMethod[];
  permitCheckoutSubmission: boolean;
  permitMockPayment: boolean;
  permitTestOrderCreation: boolean;
  prohibitedActions: string[];
  acknowledgement: true;
}

export type PersistedProjectSafetyConfiguration = Omit<
  ProjectSafetyConfiguration,
  'permitTestOrderCreation'
> & {
  permitOrderCreation: boolean;
};

export interface ProjectListRecord {
  id: string;
  organisationId: string;
  name: string;
  description: string | null;
  repositoryUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  organisation: { id: string; name: string; slug: string };
  safetyPolicies: Array<{
    domainAllowlist: string[];
    blockedActions: string[];
    configuration: unknown;
  }>;
}

export interface ProjectRecord extends ProjectListRecord {
  secrets: Array<{
    id: string;
    name: string;
    provider: string;
    externalReference: string | null;
  }>;
  safetyPolicies: Array<{
    id: string;
    domainAllowlist: string[];
    blockedActions: string[];
    configuration: unknown;
    updatedAt: Date;
  }>;
}

export interface ProjectMutationRecord {
  organisationId: string;
  projectId: string;
  name: string;
  description: string | null;
  repositoryUrl: string | null;
  configuration: PersistedProjectSafetyConfiguration;
  domainAllowlist: string[];
  blockedActions: string[];
  credentialReferences?: CredentialReferenceInput[];
}

export interface ProjectMembership {
  role: UserRole;
}
