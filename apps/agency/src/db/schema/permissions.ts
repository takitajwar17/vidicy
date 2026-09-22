// Define application permissions
export const APPLICATION_PERMISSIONS = {
  // Resource access
  ACCESS_APPLICATION: 'access_application',

  // User management
  INVITE_MEMBERS: 'invite_members',
  REMOVE_MEMBERS: 'remove_members',
  CHANGE_MEMBER_ROLES: 'change_member_roles',

  // Application management
  EDIT_APPLICATION_SETTINGS: 'edit_application_settings',
  DELETE_APPLICATION: 'delete_application',

  // Role management
  CREATE_ROLES: 'create_roles',
  EDIT_ROLES: 'edit_roles',
  DELETE_ROLES: 'delete_roles',
  ASSIGN_ROLES: 'assign_roles',

  // Content permissions
  CREATE_COMPONENTS: 'create_components',
  EDIT_COMPONENTS: 'edit_components',
  DELETE_COMPONENTS: 'delete_components',
} as const;
