import type { Request } from "express";

import type { AuthenticatedUser } from "./auth-user";

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
