import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common"
import { ConfidentialClientApplication, CryptoProvider } from "@azure/msal-node"
import { Role } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { AuthService } from "./auth.service"

const OIDC_SCOPES = ["openid", "profile", "email"]

// Entra App Role value (defined on the app registration) -> platform Role, ranked
// so a user in several roles gets the highest. SSO is AD-staff only — ADMIN
// (legacy) and PUBLIC_USER are never assignable via SSO.
const APP_ROLE_TO_ROLE: { appRole: string; role: Role; rank: number }[] = [
  { appRole: "OrgOwner", role: Role.ORG_OWNER, rank: 5 },
  { appRole: "OrgAdmin", role: Role.ORG_ADMIN, rank: 4 },
  { appRole: "ServiceManager", role: Role.SERVICE_MANAGER, rank: 3 },
  { appRole: "ServiceDeskAnalyst", role: Role.SERVICE_DESK_ANALYST, rank: 2 },
  { appRole: "Engineer", role: Role.ENGINEER, rank: 1 }
]

type EntraClaims = {
  oid?: string
  sub?: string
  preferred_username?: string
  email?: string
  upn?: string
  name?: string
  given_name?: string
  family_name?: string
  roles?: string[]
  nonce?: string
}

@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name)
  private cca: ConfidentialClientApplication | null = null
  private readonly crypto = new CryptoProvider()

  constructor(private prisma: PrismaService, private auth: AuthService) {}

  get enabled() {
    return process.env.OIDC_ENABLED === "true"
  }

  webCallbackUrl() {
    return process.env.OIDC_WEB_CALLBACK_URL || "http://localhost:5173/auth/callback"
  }

  private client(): ConfidentialClientApplication {
    if (!this.enabled) throw new ServiceUnavailableException("SSO is not enabled")
    if (this.cca) return this.cca
    const clientId = process.env.OIDC_CLIENT_ID
    const tenantId = process.env.OIDC_TENANT_ID
    const clientSecret = process.env.OIDC_CLIENT_SECRET
    if (!clientId || !tenantId || !clientSecret) {
      throw new ServiceUnavailableException("SSO is misconfigured (missing OIDC_CLIENT_ID/TENANT_ID/CLIENT_SECRET)")
    }
    this.cca = new ConfidentialClientApplication({
      auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId}`, clientSecret }
    })
    return this.cca
  }

  private redirectUri(): string {
    const uri = process.env.OIDC_REDIRECT_URI
    if (!uri) throw new ServiceUnavailableException("SSO is misconfigured (missing OIDC_REDIRECT_URI)")
    return uri
  }

  // Build the Entra authorize URL + the PKCE verifier / state / nonce the callback
  // must echo back (the controller stows these in short-lived httpOnly cookies).
  async startLogin(): Promise<{ authUrl: string; pkceVerifier: string; state: string; nonce: string }> {
    const { verifier, challenge } = await this.crypto.generatePkceCodes()
    const state = this.crypto.createNewGuid()
    const nonce = this.crypto.createNewGuid()
    const authUrl = await this.client().getAuthCodeUrl({
      scopes: OIDC_SCOPES,
      redirectUri: this.redirectUri(),
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
      state,
      nonce
    })
    return { authUrl, pkceVerifier: verifier, state, nonce }
  }

  // Exchange the auth code (PKCE), validate, provision the user, issue the app
  // session. MSAL validates issuer/audience/signature/expiry; we bind the nonce.
  async completeLogin(params: { code: string; pkceVerifier: string; expectedNonce: string }) {
    const result = await this.client().acquireTokenByCode({
      code: params.code,
      scopes: OIDC_SCOPES,
      redirectUri: this.redirectUri(),
      codeVerifier: params.pkceVerifier
    })
    const claims = (result?.idTokenClaims ?? {}) as EntraClaims
    if (!claims.nonce || claims.nonce !== params.expectedNonce) {
      throw new UnauthorizedException("SSO nonce mismatch")
    }
    const user = await this.provision(claims)
    return this.auth.issueSessionForUser(user)
  }

  private mapRole(roles?: string[]): Role | null {
    if (!roles?.length) return null
    const matches = APP_ROLE_TO_ROLE.filter((m) => roles.includes(m.appRole)).sort((a, b) => b.rank - a.rank)
    return matches[0]?.role ?? null
  }

  private async resolveOrgId(): Promise<string> {
    const configured = process.env.OIDC_ORG_ID
    if (configured) return configured
    const orgs = await this.prisma.organization.findMany({ select: { id: true }, take: 2 })
    if (orgs.length === 1) return orgs[0].id
    throw new ServiceUnavailableException("SSO organization not configured (set OIDC_ORG_ID)")
  }

  // Find-or-create the staff user from the validated Entra claims. Match by the
  // stable oid first, fall back to linking an existing local account by email,
  // else JIT-provision. Entra is the source of truth for the staff role.
  private async provision(claims: EntraClaims) {
    const oid = claims.oid ?? claims.sub
    if (!oid) throw new UnauthorizedException("SSO token missing subject")
    const email = (claims.email ?? claims.preferred_username ?? claims.upn ?? "").toLowerCase()
    if (!email) throw new UnauthorizedException("SSO token missing email")
    const role = this.mapRole(claims.roles)
    if (!role) throw new UnauthorizedException("No access role assigned in Entra for this account")

    const firstName = claims.given_name ?? (claims.name ? claims.name.split(" ")[0] : undefined)
    const lastName = claims.family_name ?? undefined

    const byOid = await this.prisma.user.findUnique({ where: { entraObjectId: oid } })
    if (byOid) {
      if (!byOid.isActive) throw new UnauthorizedException("Account is disabled")
      return this.prisma.user.update({ where: { id: byOid.id }, data: { role, email, firstName, lastName } })
    }

    const byEmail = await this.prisma.user.findUnique({ where: { email } })
    if (byEmail) {
      if (!byEmail.isActive) throw new UnauthorizedException("Account is disabled")
      return this.prisma.user.update({ where: { id: byEmail.id }, data: { entraObjectId: oid, role, firstName, lastName } })
    }

    const organizationId = await this.resolveOrgId()
    this.logger.log(`JIT-provisioning SSO user ${email} (role ${role})`)
    return this.prisma.user.create({
      data: { email, entraObjectId: oid, role, firstName, lastName, organizationId, isActive: true }
    })
  }
}
