import type { UserRole } from '@taskos/shared-types';

export const organisationPermissions = ['VIEW_ORGANISATION', 'VIEW_MEMBERS'] as const;
export type OrganisationPermission = (typeof organisationPermissions)[number];

const permissionsByRole: Record<UserRole, readonly OrganisationPermission[]> = {
  OWNER: organisationPermissions,
  ADMIN: organisationPermissions,
  MEMBER: ['VIEW_ORGANISATION'],
  VIEWER: ['VIEW_ORGANISATION'],
};

export function permissionsForRole(role: UserRole): OrganisationPermission[] {
  return [...permissionsByRole[role]];
}

export function hasOrganisationPermission(
  role: UserRole,
  permission: OrganisationPermission,
): boolean {
  return permissionsByRole[role].includes(permission);
}
