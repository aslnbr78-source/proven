export const ROLES = {
  ADMIN: 'admin',
  TEACHER: 'teacher',
  STUDENT: 'student',
}

export function getHomePathForRole(role) {
  switch (role) {
    case ROLES.ADMIN:
      return '/admin'
    case ROLES.TEACHER:
      return '/teacher'
    default:
      return '/hub'
  }
}

export function getRoleLabel(role) {
  switch (role) {
    case ROLES.ADMIN:
      return 'Admin'
    case ROLES.TEACHER:
      return 'Teacher'
    default:
      return 'Student'
  }
}
