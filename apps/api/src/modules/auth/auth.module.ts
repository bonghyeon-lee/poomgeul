import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";

import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { GitHubStrategy } from "./github.strategy.js";
import { PgSessionStore } from "./pg-session-store.js";
import { SessionGuard } from "./session.guard.js";
import { SESSION_STORE } from "./session-store.js";

/**
 * DB_TOKEN은 @Global() DatabaseModule이 AppModule 한 곳에서 등록하므로
 * 여기 holder를 두지 않는다. PassportModule과 AuthController·Service·Strategy·
 * SessionGuard만 배선.
 */
@Module({
  // `session: false` — passport-github2는 콜백당 1회 실행되고, DB 세션은 ADR-0005대로
  // 별도 Postgres `sessions` 테이블로 직접 관리. express-session은 전혀 건드리지 않는다.
  imports: [PassportModule.register({ session: false })],
  controllers: [AuthController],
  providers: [
    {
      provide: SESSION_STORE,
      useClass: PgSessionStore,
    },
    AuthService,
    GitHubStrategy,
    SessionGuard,
  ],
  exports: [SESSION_STORE, SessionGuard],
})
export class AuthModule {}
