import type { UserRole } from "@wuxu/shared-types";

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface JwtPayload {
  sub: string;
  email: string;
  displayName: string;
  role: UserRole;
}
