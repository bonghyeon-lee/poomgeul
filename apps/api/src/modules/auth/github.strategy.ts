import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, type StrategyOptions } from "passport-github2";

import { AuthService, type GitHubProfileInput } from "./auth.service.js";

type PassportProfile = {
  id: string;
  username?: string;
  displayName?: string;
  emails?: Array<{ value: string; primary?: boolean; verified?: boolean }>;
};

type VerifyDone = (err: Error | null, user?: GitHubProfileInput) => void;

/**
 * passport-github2 wrapper. We do not use Passport sessions — the strategy
 * runs once per callback and hands the verified profile back to the
 * controller, which creates our own DB session.
 */
@Injectable()
export class GitHubStrategy extends PassportStrategy(
  Strategy as unknown as new (
    options: StrategyOptions,
    verify: (
      accessToken: string,
      refreshToken: string,
      profile: PassportProfile,
      done: VerifyDone,
    ) => void,
  ) => unknown,
  "github",
) {
  constructor(private readonly auth: AuthService) {
    const clientID = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    const callbackURL = process.env.GITHUB_OAUTH_CALLBACK_URL ?? defaultCallbackUrl();
    if (!clientID || !clientSecret) {
      throw new Error(
        "GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET must be set (see docs/guides/authentication.md).",
      );
    }
    super({
      clientID,
      clientSecret,
      callbackURL,
      // We ship our own state via cookie (ADR-0005). passport-github2 supports
      // `state: true` with a session store, which we explicitly avoid.
      scope: ["read:user", "user:email"],
    } satisfies StrategyOptions);
  }

  /**
   * Maps passport-github2's profile to our upsert input and returns the User.
   * Any "we can't get a verified email" case fails the flow fast.
   */
  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: PassportProfile,
  ): Promise<GitHubProfileInput> {
    if (!profile.id) throw new UnauthorizedException("github profile missing id");
    if (!profile.username) throw new UnauthorizedException("github profile missing username");

    const primary = profile.emails?.find((e) => e.primary && e.verified !== false);
    const anyVerified = profile.emails?.find((e) => e.verified !== false);
    const emailEntry = primary ?? anyVerified;
    if (!emailEntry) {
      throw new UnauthorizedException(
        "github account has no verified public email — enable email access in the GitHub app scopes or set one to public.",
      );
    }

    return {
      githubId: profile.id,
      githubHandle: profile.username,
      email: emailEntry.value,
      displayName: profile.displayName ?? null,
    };
  }
}

function defaultCallbackUrl(): string {
  const port = process.env.PORT ?? "3000";
  return `http://localhost:${port}/api/auth/github/callback`;
}
