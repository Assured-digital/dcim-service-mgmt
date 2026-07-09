import { Controller, Get, VERSION_NEUTRAL } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("health")
// Version-neutral so container/ingress health probes keep hitting /health.
@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  ok() {
    return { status: "ok" };
  }
}