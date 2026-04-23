import {
  CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import { parseCookies, SESSION_COOKIE } from "./cookie.js";
import { SESSION_STORE, type SessionStore } from "./session-store.js";

/**
 * Opt-in guard — attach with `@UseGuards(SessionGuard)` on write endpoints.
 * Public reads (M0 §1) stay ungated.
 *
 * On success, attaches the resolved user and session to `req` so handlers can
 * read them via `@CurrentUser()` / `@CurrentSession()`.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(SESSION_STORE) private readonly store: SessionStore) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & AttachedAuth>();
    const cookies = parseCookies(req.headers.cookie);
    const sid = cookies[SESSION_COOKIE];
    if (!sid) throw new UnauthorizedException("missing session");
    const active = await this.store.findActive(sid);
    if (!active) throw new UnauthorizedException("invalid or expired session");
    req.user = active.user;
    req.session = active.session;
    return true;
  }
}

export type AttachedAuth = {
  user?: import("@poomgeul/db").User;
  session?: import("@poomgeul/db").Session;
};
