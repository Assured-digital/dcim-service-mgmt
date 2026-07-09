import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import * as cookieParser from "cookie-parser";
import { Request, Response, NextFunction } from "express";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { setupSwagger, SWAGGER_PATH } from "./swagger";

async function bootstrap() {
  const corsOrigins =
    process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()) || [
      "http://localhost:5173",
      "http://localhost:3001"
    ];

  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: corsOrigins,
      credentials: true
    }
  });

  app.useGlobalFilters(new HttpExceptionFilter());

  // Optional request logging
  if (process.env.LOG_REQUESTS === "true") {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`[REQ] ${req.method} ${req.url}`);
      next();
    });
  }

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );

  // ADR-006 — versioned APIs. All routes are served under /v1 (URI versioning);
  // /health stays version-neutral for probes. New versions opt in per-handler via @Version.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  setupSwagger(app);

  const port = Number(process.env.PORT ?? 3001);

  await app.listen(port, "0.0.0.0");
  console.log(
    `API running on http://0.0.0.0:${port} (docs: /${SWAGGER_PATH})`
  );
}

bootstrap();