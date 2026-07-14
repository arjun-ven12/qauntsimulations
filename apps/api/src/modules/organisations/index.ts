export interface OrganisationAuthorizer { canAccess(userId: string, organisationId: string): Promise<boolean> }
