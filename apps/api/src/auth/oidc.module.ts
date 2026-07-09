import { Module } from "@nestjs/common"
import { AuthModule } from "./auth.module"
import { PrismaModule } from "../prisma/prisma.module"
import { OidcService } from "./oidc.service"
import { OidcController } from "./oidc.controller"

// A1 — Microsoft Entra SSO (OIDC auth-code + PKCE). Reuses AuthService to issue
// the app's own session once Entra has validated + provisioned the user.
@Module({
  imports: [AuthModule, PrismaModule],
  providers: [OidcService],
  controllers: [OidcController]
})
export class OidcModule {}
