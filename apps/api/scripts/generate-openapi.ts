import "reflect-metadata";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { buildOpenApiDocument } from "../src/swagger";

// Repo-root docs/openapi.json (this script lives in apps/api/scripts).
const OUT_PATH = resolve(__dirname, "../../../docs/openapi.json");

/** Short HEAD commit the spec was generated from; "unknown" if git is unavailable. */
function gitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

async function main() {
  // create() instantiates providers but does NOT run onModuleInit, so Prisma
  // never connects — generation works offline / in CI without a database.
  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    const document = buildOpenApiDocument(app);

    // JSON can't hold a literal comment, so the date/commit "header" rides as
    // root-level OpenAPI vendor extensions (x-*), placed first in the file.
    const stamped = {
      "x-generated-at": new Date().toISOString(),
      "x-generated-from-commit": gitCommit(),
      ...document,
    };

    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, `${JSON.stringify(stamped, null, 2)}\n`);
    Logger.log(`OpenAPI spec written to ${OUT_PATH}`, "generate-openapi");
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  Logger.error(err, undefined, "generate-openapi");
  process.exit(1);
});
