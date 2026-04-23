import "reflect-metadata";

import { RequestMethod, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // All domain routes live under /api. `/healthz` stays at the root so the
  // CI migrate-and-smoke job and any infra probe can hit it without the prefix.
  // Swagger UI (api/docs) is also under the prefix.
  app.setGlobalPrefix("api", {
    exclude: [{ path: "healthz", method: RequestMethod.GET }],
  });

  // CORS — dev: Next.js at :3001. Prod: domain list lives in env (not set yet).
  const devOrigins = ["http://localhost:3001"];
  const envOrigins = process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  app.enableCors({
    origin: [...new Set([...devOrigins, ...envOrigins])],
    credentials: true,
  });

  // OpenAPI — consumed by packages/types via openapi-typescript.
  //
  // Known caveat: `tsx` (used by `pnpm dev`) does not emit decorator metadata,
  // which breaks @nestjs/swagger's parameter reflection. The document builds
  // cleanly under the compiled `node dist/main.js` path (production, CI,
  // `pnpm generate`), so we wrap the setup in try/catch and log-and-continue
  // in dev instead of blocking the server on a docs pipeline. If you need
  // Swagger UI during development, run `pnpm --filter @poomgeul/api build &&
  // node dist/main.js` in a separate shell.
  try {
    const config = new DocumentBuilder()
      .setTitle("poomgeul API")
      .setDescription("Internal API for the poomgeul translation platform.")
      .setVersion("0.0.0")
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);
  } catch (err) {
    const hint =
      err instanceof TypeError && err.message.includes("undefined")
        ? " (looks like a missing decorator metadata — are you running under tsx?)"
        : "";
    console.warn(`[api] Swagger document generation skipped${hint}:`, err);
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`[api] listening on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
