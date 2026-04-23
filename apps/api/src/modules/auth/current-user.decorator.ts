import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { User } from "@poomgeul/db";
import type { Request } from "express";

import type { AttachedAuth } from "./session.guard.js";

/**
 * Resolves the authenticated User from the request. Must be used together
 * with `@UseGuards(SessionGuard)` — without the guard there is no user to
 * read and this decorator throws.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): User => {
  const req = ctx.switchToHttp().getRequest<Request & AttachedAuth>();
  if (!req.user) {
    throw new Error("CurrentUser decorator used without SessionGuard");
  }
  return req.user;
});
