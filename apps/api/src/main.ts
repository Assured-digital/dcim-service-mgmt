import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import * as cookieParser from "cookie-parser";
import { Request, Response, NextFunction } from "express";

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

  const config = new DocumentBuilder()
    .setTitle("DCMS API")
    .setDescription("DC Service Management MVP API")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  await app.listen(3001);

  console.log(`API running on http://localhost:3001 (docs: /docs)`);
}

bootstrap();