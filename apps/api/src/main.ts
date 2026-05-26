import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import * as cookieParser from "cookie-parser";
import { Request, Response, NextFunction } from "express";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

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

  const config = new DocumentBuilder()
    .setTitle("DCMS API")
    .setDescription("DC Service Management MVP API")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  const port = Number(process.env.PORT ?? 3001);
  
  await app.listen(port, "0.0.0.0");
  console.log(`API running on http://0.0.0.0:${port} (docs: /docs)`);
}

bootstrap();