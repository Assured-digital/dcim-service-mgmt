import { PrismaClient, Role } from "@prisma/client"
import * as bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD

  if (!email || !password) {
    console.error(
      "Bootstrap aborted: BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must both be set."
    )
    process.exit(1)
  }

  // Idempotency / safety guard: only ever creates the FIRST admin.
  // If any user already exists, this is a no-op.
  const userCount = await prisma.user.count()
  if (userCount > 0) {
    console.log(`Bootstrap skipped: ${userCount} user(s) already exist. No action taken.`)
    return
  }

  // Ensure the default organization exists (same sentinel ID the app expects).
  const organization = await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Assured Digital",
      status: "ACTIVE"
    }
  })

  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: Role.ORG_OWNER,
      organizationId: organization.id,
      isActive: true
    }
  })

  console.log(`Bootstrap complete: created ORG_OWNER '${admin.email}'.`)
}

main()
  .catch((e) => {
    console.error("Bootstrap failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })