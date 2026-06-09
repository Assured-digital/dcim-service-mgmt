import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from "@nestjs/swagger";

/** Path serving both the Swagger UI and the JSON spec (e.g. /api, /api-json). */
export const SWAGGER_PATH = "api";

/** Bearer-auth scheme name — reference from controllers via @ApiBearerAuth(SWAGGER_BEARER_AUTH). */
export const SWAGGER_BEARER_AUTH = "access-token";

/** Build the OpenAPI document from the Nest app (shared by main.ts + the spec exporter). */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("AD Service Management API")
    .setDescription("Multi-tenant DCIM + ITSM platform API for Assured Digital.")
    .setVersion("0.1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        in: "header",
        description: "JWT access token issued by POST /auth/login",
      },
      SWAGGER_BEARER_AUTH,
    )
    .build();

  return SwaggerModule.createDocument(app, config);
}

/** Mount the Swagger UI + JSON spec at SWAGGER_PATH. */
export function setupSwagger(app: INestApplication): OpenAPIObject {
  const document = buildOpenApiDocument(app);
  SwaggerModule.setup(SWAGGER_PATH, app, document);
  return document;
}
