/**
 * Device-Type Catalogue Seed  (DCIM spec §3)
 * ──────────────────────────────────────────
 * A small hand-picked starter set of common device types across Dell / HPE /
 * Cisco / APC — enough to prove the catalogue tables, NOT the full NetBox import
 * (that lazy/selective import is a later slice). The global catalogue is shared
 * across all tenants, so this is a one-time backend concern, not a per-client seed.
 *
 * Run:  npm run seed:device-types          (from apps/api)
 *
 * Idempotent: manufacturers and device types are upserted by their unique NetBox
 * slug, so re-running never duplicates. Every row is marked isSeeded=true so a
 * future re-seed can be distinguished from (and never clobbers) user-created types.
 *
 * Slugs mirror the NetBox devicetype-library naming so a later real import dedupes
 * cleanly against these starter rows.
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// ─── Manufacturers (upsert by slug) ──────────────────────────────────
const MANUFACTURERS: { name: string; slug: string }[] = [
  { name: "Dell", slug: "dell" },
  { name: "HPE", slug: "hpe" },
  { name: "Cisco", slug: "cisco" },
  { name: "APC", slug: "apc" },
]

// ─── Device types (upsert by slug). uHeight is a Float (0.5U capable); a 0U rack
//     PDU is uHeight 0. powerDrawW is the nameplate draw where meaningful (UPS
//     output ratings are left null — they are not a draw figure). ───────────────
type SeedDeviceType = {
  manufacturerSlug: string
  model: string
  slug: string
  uHeight: number
  isFullDepth: boolean
  powerDrawW: number | null
  partNumber: string | null
}

const DEVICE_TYPES: SeedDeviceType[] = [
  // Dell PowerEdge
  { manufacturerSlug: "dell", model: "PowerEdge R740", slug: "poweredge-r740", uHeight: 2, isFullDepth: true, powerDrawW: 750, partNumber: null },
  { manufacturerSlug: "dell", model: "PowerEdge R640", slug: "poweredge-r640", uHeight: 1, isFullDepth: true, powerDrawW: 750, partNumber: null },
  { manufacturerSlug: "dell", model: "PowerEdge R750", slug: "poweredge-r750", uHeight: 2, isFullDepth: true, powerDrawW: 800, partNumber: null },
  // HPE ProLiant
  { manufacturerSlug: "hpe", model: "ProLiant DL380 Gen10", slug: "proliant-dl380-gen10", uHeight: 2, isFullDepth: true, powerDrawW: 800, partNumber: null },
  { manufacturerSlug: "hpe", model: "ProLiant DL360 Gen10", slug: "proliant-dl360-gen10", uHeight: 1, isFullDepth: true, powerDrawW: 500, partNumber: null },
  { manufacturerSlug: "hpe", model: "ProLiant DL325 Gen10", slug: "proliant-dl325-gen10", uHeight: 1, isFullDepth: true, powerDrawW: 500, partNumber: null },
  // Cisco switches
  { manufacturerSlug: "cisco", model: "Catalyst 9300", slug: "catalyst-9300", uHeight: 1, isFullDepth: false, powerDrawW: 435, partNumber: null },
  { manufacturerSlug: "cisco", model: "Catalyst 9500", slug: "catalyst-9500", uHeight: 1, isFullDepth: false, powerDrawW: 650, partNumber: null },
  { manufacturerSlug: "cisco", model: "Nexus 9336C-FX2", slug: "nexus-9336c-fx2", uHeight: 1, isFullDepth: true, powerDrawW: 650, partNumber: null },
  // APC power
  { manufacturerSlug: "apc", model: "Smart-UPS SRT 3000", slug: "smart-ups-srt-3000rmxli", uHeight: 2, isFullDepth: true, powerDrawW: null, partNumber: "SRT3000RMXLI" },
  { manufacturerSlug: "apc", model: "Smart-UPS SRT 1500", slug: "smart-ups-srt-1500rmxli", uHeight: 2, isFullDepth: true, powerDrawW: null, partNumber: "SRT1500RMXLI" },
  { manufacturerSlug: "apc", model: "Rack PDU AP8853", slug: "ap8853", uHeight: 0, isFullDepth: false, powerDrawW: null, partNumber: "AP8853" },
]

async function main() {
  console.log("Seeding device-type catalogue …")

  // Manufacturers first — upsert by slug, keep name in sync.
  const mfrIdBySlug = new Map<string, string>()
  for (const m of MANUFACTURERS) {
    const mfr = await prisma.manufacturer.upsert({
      where: { slug: m.slug },
      update: { name: m.name },
      create: { name: m.name, slug: m.slug },
    })
    mfrIdBySlug.set(m.slug, mfr.id)
  }
  console.log(`  • ${mfrIdBySlug.size} manufacturers upserted`)

  // Device types — upsert by slug, mark isSeeded=true.
  let created = 0
  let updated = 0
  for (const d of DEVICE_TYPES) {
    const manufacturerId = mfrIdBySlug.get(d.manufacturerSlug)
    if (!manufacturerId) throw new Error(`Unknown manufacturer slug: ${d.manufacturerSlug}`)

    const existing = await prisma.deviceType.findUnique({ where: { slug: d.slug } })
    await prisma.deviceType.upsert({
      where: { slug: d.slug },
      update: {
        manufacturerId,
        model: d.model,
        uHeight: d.uHeight,
        isFullDepth: d.isFullDepth,
        powerDrawW: d.powerDrawW,
        partNumber: d.partNumber,
        isSeeded: true,
      },
      create: {
        manufacturerId,
        model: d.model,
        slug: d.slug,
        uHeight: d.uHeight,
        isFullDepth: d.isFullDepth,
        powerDrawW: d.powerDrawW,
        partNumber: d.partNumber,
        isSeeded: true,
      },
    })
    if (existing) updated++
    else created++
  }
  console.log(`  • device types: ${created} created, ${updated} updated`)
  console.log("Done.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
