import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request, Response } from "express";

import { AuthService, type GitHubProfileInput } from "./auth.service.js";
import {
  clearCookie,
  parseCookies,
  SESSION_COOKIE,
  serializeOauthStateCookie,
  serializeSessionCookie,
} from "./cookie.js";
import { createState, OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_MS, verifyState } from "./oauth-state.js";
import { type AttachedAuth, SessionGuard } from "./session.guard.js";
import { SESSION_STORE, type SessionStore } from "./session-store.js";

/**
 * ADR-0005 OAuth endpoints.
 *
 * `/github` and `/github/callback` are never guarded (unauthenticated is the
 * whole point). `/me` and `/logout` ride SessionGuard.
 *
 * We do not use Passport sessions — passport-github2 runs once inside the
 * callback and hands us a verified profile, and we then mint our own DB session.
 */
@Controller("auth")
export class AuthController {
  private readonly webBaseUrl = process.env.WEB_BASE_URL ?? "http://localhost:3001";

  constructor(
    private readonly auth: AuthService,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
  ) {}

  /** Kicks off GitHub OAuth. Sets an HMAC-signed `state` cookie, 302 to GitHub. */
  @Get("github")
  start(@Res() res: Response): void {
    const secret = sessionSecret();
    const { state, cookieValue } = createState(secret);
    res.setHeader(
      "Set-Cookie",
      serializeOauthStateCookie(OAUTH_STATE_COOKIE, cookieValue, OAUTH_STATE_TTL_MS),
    );
    const authorizeUrl = buildGitHubAuthorizeUrl(state);
    res.redirect(HttpStatus.FOUND, authorizeUrl);
  }

  /**
   * GitHub OAuth callback. Validates the state cookie, then defers to Passport
   * to exchange the code and fetch the profile (handled by GitHubStrategy).
   */
  @Get("github/callback")
  @UseGuards(AuthGuard("github"))
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const cookies = parseCookies(req.headers.cookie);
    const check = verifyState(
      typeof req.query.state === "string" ? req.query.state : undefined,
      cookies[OAUTH_STATE_COOKIE],
      sessionSecret(),
    );
    // passport has already run by the time the method body executes (guards
    // run first), but we want the state check to be authoritative regardless.
    if (!check.ok) {
      // Clear any partial state cookie so the next attempt starts fresh.
      res.setHeader("Set-Cookie", clearCookie(OAUTH_STATE_COOKIE));
      throw new BadRequestException(`oauth state: ${check.reason}`);
    }

    const profile = req.user as GitHubProfileInput | undefined;
    if (!profile) throw new UnauthorizedException("no github profile on request");
    const user = await this.auth.upsertGitHubUser(profile);
    const session = await this.sessions.create({ userId: user.id });

    res.setHeader("Set-Cookie", [
      clearCookie(OAUTH_STATE_COOKIE),
      serializeSessionCookie(session.sessionId, session.expiresAt),
    ]);
    res.redirect(HttpStatus.SEE_OTHER, this.webBaseUrl);
  }

  @Get("me")
  @UseGuards(SessionGuard)
  me(@Req() req: Request & AttachedAuth): PublicUser {
    const user = req.user;
    if (!user) throw new UnauthorizedException("guard did not attach user");
    return toPublicUser(user);
  }

  @Post("logout")
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request & AttachedAuth, @Res() res: Response): Promise<void> {
    if (req.session) await this.sessions.revoke(req.session.sessionId);
    res.setHeader("Set-Cookie", clearCookie(SESSION_COOKIE));
    res.status(HttpStatus.NO_CONTENT).send();
  }
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  githubHandle: string | null;
  tier: "new" | "verified" | "maintainer" | "curator";
}

function toPublicUser(user: import("@poomgeul/db").User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    githubHandle: user.githubHandle,
    tier: user.tier,
  };
}

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET must be set (>=16 chars). See .env.example.");
  }
  return s;
}

function buildGitHubAuthorizeUrl(state: string): string {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) throw new Error("GITHUB_CLIENT_ID must be set");
  const callbackURL =
    process.env.GITHUB_OAUTH_CALLBACK_URL ??
    `http://localhost:${process.env.PORT ?? "3000"}/api/auth/github/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackURL,
    scope: "read:user user:email",
    state,
    allow_signup: "true",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}
