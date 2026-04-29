/**
 * Demo Estate Seed
 * ────────────────
 * Loads apps/api/prisma/fixtures/demo-estate.csv into a "University of Testing"
 * client attached to the existing DCMS Default Organization.
 *
 * Run:  pnpm --filter api seed:demo
 *
 * Idempotent: re-running will skip records that already exist (matched by
 * deterministic asset tag, cabinet name+room, etc.).
 */

import { PrismaClient, OwnerType, AssetLifecycleState } from "@prisma/client"
import { readFileSync, existsSync } from "fs"
import { join } from "path"

const prisma = new PrismaClient()

// ─── Configuration ───────────────────────────────────────────────────

const ORG_ID = "00000000-0000-0000-0000-000000000001" // matches base seed.ts
const CLIENT_NAME = "University of Testing"
const SITE_NAME = "Main Data Centre"
const SITE_ADDRESS = "Temple Quay"
const SITE_CITY = "Bristol"
const SITE_POSTCODE = "BS1 6EG"
const SITE_COUNTRY = "UK"

const CSV_PATH = join(__dirname, "..", "fixtures", "demo-estate.csv")

const TAG_PREFIX: Record<string, string> = {
  "Server": "SRV",
  "Network Device": "NET",
  "Network Storage": "STR",
  "Rack PDU": "PDU",
  "Patch Panel": "PP",
  "KVM Switch": "KVM",
  "Blade Enclosure": "BLADE",
  "In Row Cooling": "COOL",
  "Other Device": "DEV",
}

const DEFAULT_U_HEIGHT: Record<string, number> = {
  "Server": 2,
  "Network Device": 1,
  "Network Storage": 2,
  "Rack PDU": 0,
  "Patch Panel": 1,
  "KVM Switch": 1,
  "Blade Enclosure": 10,
  "In Row Cooling": 0,
  "Other Device": 1,
}

function estimatePowerDrawW(type: string, model: string): number {
  switch (type) {
    case "Server":
      if (/r6\d{2}/i.test(model)) return randInt(280, 380)
      if (/r7\d{2}|dl3\d{2}/i.test(model)) return randInt(450, 650)
      return randInt(350, 550)
    case "Network Device":
      if (/nexus.*9\d{3}|n9k/i.test(model)) return randInt(300, 500)
      if (/nexus.*5\d{3}/i.test(model)) return randInt(400, 600)
      if (/2900|catalyst/i.test(model)) return randInt(80, 150)
      return randInt(150, 300)
    case "Network Storage":
      if (/alletra/i.test(model)) return randInt(450, 700)
      return randInt(300, 550)
    case "Blade Enclosure": return randInt(2000, 3500)
    case "In Row Cooling": return randInt(1500, 2800)
    case "KVM Switch": return 30
    case "Other Device": return randInt(50, 200)
    case "Rack PDU":
    case "Patch Panel":
    default:
      return 0
  }
}

// ─── Deterministic helpers ──────────────────────────────────────────

let SEED_RNG = 0xC0FFEE
function nextRand(): number {
  SEED_RNG = (SEED_RNG * 1664525 + 1013904223) & 0x7FFFFFFF
  return SEED_RNG / 0x7FFFFFFF
}
function randInt(min: number, max: number): number {
  return Math.floor(nextRand() * (max - min + 1)) + min
}
function syntheticSerial(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  return `DEMO-${Math.abs(hash).toString(16).toUpperCase().padStart(8, "0")}`
}

// ─── CSV parser ─────────────────────────────────────────────────────

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(l => l.length > 0)
  if (lines.length === 0) return []
  const headers = splitCsvLine(lines[0])
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = cells[i] ?? "" })
    return row
  })
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inQuote = false
      else cur += ch
    } else {
      if (ch === '"') inQuote = true
      else if (ch === ",") { out.push(cur); cur = "" }
      else cur += ch
    }
  }
  out.push(cur)
  return out.map(s => s.trim())
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🌱 Seeding demo estate…\n")

  if (!existsSync(CSV_PATH)) {
    console.error(`❌ CSV not found at ${CSV_PATH}`)
    console.error(`   Make sure demo-estate.csv is in apps/api/prisma/fixtures/`)
    process.exit(1)
  }

  const rows = parseCsv(readFileSync(CSV_PATH, "utf-8"))
  console.log(`   Parsed ${rows.length} rows from CSV`)

  // ─── 1. Look up existing org from base seed ─────────────────────────

  const org = await prisma.organization.findUnique({ where: { id: ORG_ID } })
  if (!org) {
    console.error(`❌ Organization ${ORG_ID} not found.`)
    console.error(`   Run the base seed first:  pnpm --filter api seed`)
    process.exit(1)
  }
  console.log(`   ↺ Using existing organization: ${org.name}`)

  // ─── 2. Client → Site → Rooms ───────────────────────────────────────

  let client = await prisma.client.findFirst({
    where: { name: CLIENT_NAME, organizationId: org.id }
  })
  if (!client) {
    client = await prisma.client.create({
      data: { name: CLIENT_NAME, organizationId: org.id, status: "ACTIVE" }
    })
    console.log(`   ✓ Created client: ${CLIENT_NAME}`)
  } else {
    console.log(`   ↺ Found existing client: ${CLIENT_NAME}`)
  }

  let site = await prisma.site.findFirst({
    where: { name: SITE_NAME, clientId: client.id }
  })
  if (!site) {
    site = await prisma.site.create({
      data: {
        name: SITE_NAME,
        clientId: client.id,
        address: SITE_ADDRESS,
        city: SITE_CITY,
        postcode: SITE_POSTCODE,
        country: SITE_COUNTRY,
        notes: "Demo site populated from sanitised real-world export"
      }
    })
    console.log(`   ✓ Created site: ${SITE_NAME}`)
  } else {
    // Backfill address fields so existing dev DBs light up on the map without a reset
    const needsAddressBackfill = !site.address || !site.postcode
    if (needsAddressBackfill) {
      site = await prisma.site.update({
        where: { id: site.id },
        data: {
          address: site.address ?? SITE_ADDRESS,
          city: site.city ?? SITE_CITY,
          postcode: site.postcode ?? SITE_POSTCODE
        }
      })
      console.log(`   ✎ Backfilled address on existing site: ${SITE_NAME}`)
    } else {
      console.log(`   ↺ Found existing site: ${SITE_NAME}`)
    }
  }

  // Discover rooms from CSV
  const roomNames = new Set<string>()
  for (const row of rows) {
    const parts = row["Asset Location"].split(" / ").map(s => s.trim())
    const roomIdx = parts.indexOf(SITE_NAME) + 1
    if (roomIdx > 0 && parts[roomIdx]) roomNames.add(parts[roomIdx])
  }

  const roomMap = new Map<string, string>()
  for (const roomName of roomNames) {
    let room = await prisma.room.findFirst({
      where: { name: roomName, siteId: site.id }
    })
    if (!room) {
      room = await prisma.room.create({
        data: { name: roomName, siteId: site.id, type: "DATA_HALL" }
      })
      console.log(`   ✓ Created room: ${roomName}`)
    }
    roomMap.set(roomName, room.id)
  }

  // ─── 3. Cabinets — derive identity from asset row paths ─────────────

  const assetRows = rows.filter(r => r["Type"] !== "Rack")
  const rackPaths = new Set<string>()
  for (const row of assetRows) {
    const parts = row["Asset Location"].split(" / ").map(s => s.trim())
    if (parts.length >= 4) rackPaths.add(row["Asset Location"])
  }

  const cabinetMap = new Map<string, string>() // "Hall A/Rack-04" → cabinet.id
  const sortedRackPaths = Array.from(rackPaths).sort()

  for (const path of sortedRackPaths) {
    const parts = path.split(" / ").map(s => s.trim())
    const roomName = parts[2]
    const rackLabel = parts[3]
    const roomId = roomMap.get(roomName)!

    let cabinet = await prisma.cabinet.findFirst({
      where: { name: rackLabel, siteId: site.id, roomId }
    })
    if (!cabinet) {
      cabinet = await prisma.cabinet.create({
        data: {
          siteId: site.id,
          roomId,
          name: rackLabel,
          type: "RACK",
          totalU: randInt(0, 2) === 0 ? 42 : 48,
          powerKw: 8 + randInt(0, 4)
        }
      })
    }
    cabinetMap.set(`${roomName}/${rackLabel}`, cabinet.id)
  }
  console.log(`   ✓ Cabinets: ${cabinetMap.size}`)

  // ─── 4. Assets ──────────────────────────────────────────────────────

  const tagCounter: Record<string, number> = {}
  const cabinetCursor: Record<string, number> = {}

  let createdAssets = 0
  let skippedAssets = 0

  for (const row of assetRows) {
    const type = row["Type"]
    const manufacturer = row["Manufacturer"]
    const model = row["Model"]
    const path = row["Asset Location"]

    const prefix = TAG_PREFIX[type] ?? "AST"
    tagCounter[prefix] = (tagCounter[prefix] ?? 0) + 1
    const assetTag = `${prefix}-${tagCounter[prefix].toString().padStart(4, "0")}`

    const existing = await prisma.asset.findUnique({ where: { assetTag } })
    if (existing) { skippedAssets++; continue }

    const parts = path.split(" / ").map(s => s.trim())
    const roomName = parts[2]
    const rackLabel = parts.length >= 4 ? parts[3] : null

    let cabinetId: string | null = null
    let uPosition: number | null = null
    const uHeight = DEFAULT_U_HEIGHT[type] ?? 1

    if (rackLabel) {
      const key = `${roomName}/${rackLabel}`
      cabinetId = cabinetMap.get(key) ?? null

      if (cabinetId && uHeight > 0) {
        const cab = await prisma.cabinet.findUnique({ where: { id: cabinetId } })
        const cursor = cabinetCursor[cabinetId] ?? 1
        if (cursor + uHeight - 1 <= (cab?.totalU ?? 42)) {
          uPosition = cursor
          cabinetCursor[cabinetId] = cursor + uHeight
        }
      }
    }

    const powerDrawW = estimatePowerDrawW(type, model)
    const serial = syntheticSerial(`${assetTag}|${manufacturer}|${model}`)

    await prisma.asset.create({
      data: {
        assetTag,
        name: assetTag,
        assetType: type,
        ownerType: OwnerType.CLIENT,
        clientId: client.id,
        siteId: site.id,
        cabinetId,
        manufacturer: manufacturer || null,
        modelNumber: model || null,
        serialNumber: serial,
        uHeight: uHeight > 0 ? uHeight : null,
        uPosition,
        powerDrawW: powerDrawW > 0 ? powerDrawW : null,
        status: "ACTIVE",
        lifecycleState: "ACTIVE",
        rackSide: "FRONT",
      }
    })
    createdAssets++
  }
  console.log(`   ✓ Assets created: ${createdAssets}, skipped (existing): ${skippedAssets}`)

  // ─── 5. Update each cabinet's usedU ────────────────────────────────

  for (const cabinetId of cabinetMap.values()) {
    const racked = await prisma.asset.findMany({
      where: { cabinetId, uPosition: { not: null } }
    })
    const usedU = racked.reduce((sum, a) => sum + (a.uHeight ?? 1), 0)
    await prisma.cabinet.update({
      where: { id: cabinetId },
      data: { usedU }
    })
  }
  console.log(`   ✓ Cabinet usedU updated\n`)

  // ─── 6. Additional UK sites (multi-site estate) ─────────────────────

  console.log("── Seeding additional UK sites ──")
  const additionalTotals = { sites: 0, assets: 0, skipped: 0 }
  for (const spec of ADDITIONAL_SITES) {
    const result = await seedAdditionalSite(client.id, spec)
    additionalTotals.sites += result.siteCreated ? 1 : 0
    additionalTotals.assets += result.assetsCreated
    additionalTotals.skipped += result.assetsSkipped
  }
  console.log(`   ✓ Additional sites: ${additionalTotals.sites} new, ${additionalTotals.assets} assets created, ${additionalTotals.skipped} skipped\n`)

  const totalSites = await prisma.site.count({ where: { clientId: client.id } })
  const totalAssets = await prisma.asset.count({ where: { clientId: client.id } })

  console.log("✅ Demo estate seed complete")
  console.log(`   Client: ${client.name}`)
  console.log(`   Sites: ${totalSites}`)
  console.log(`   Assets across estate: ${totalAssets}`)
}

// ─── Additional-site estate ─────────────────────────────────────────

type CabinetProfile = "compute-dense" | "compute-mix" | "network-core" | "storage" | "edge"

type CabinetAssetSpec = { type: string; manufacturer: string; model: string; count: number }

const CABINET_ASSETS: Record<CabinetProfile, CabinetAssetSpec[]> = {
  "compute-dense": [
    { type: "Network Device", manufacturer: "Cisco", model: "Nexus 9300", count: 1 },
    { type: "Patch Panel",    manufacturer: "Panduit", model: "DP24",      count: 1 },
    { type: "Rack PDU",       manufacturer: "APC",     model: "AP8681",    count: 2 },
    { type: "Server",         manufacturer: "Dell",    model: "PowerEdge R650", count: 10 }
  ],
  "compute-mix": [
    { type: "Network Device", manufacturer: "Cisco",   model: "Catalyst 2960", count: 1 },
    { type: "Patch Panel",    manufacturer: "Panduit", model: "DP24",          count: 1 },
    { type: "Rack PDU",       manufacturer: "APC",     model: "AP8681",        count: 2 },
    { type: "Server",         manufacturer: "HPE",     model: "DL380 Gen10",   count: 6 },
    { type: "Server",         manufacturer: "Dell",    model: "PowerEdge R740", count: 2 }
  ],
  "network-core": [
    { type: "Network Device", manufacturer: "Cisco",   model: "Nexus 9504",    count: 2 },
    { type: "Network Device", manufacturer: "Cisco",   model: "Nexus 5596",    count: 2 },
    { type: "Network Device", manufacturer: "Cisco",   model: "Catalyst 2960", count: 4 },
    { type: "Patch Panel",    manufacturer: "Panduit", model: "DP48",          count: 2 },
    { type: "Rack PDU",       manufacturer: "APC",     model: "AP8681",        count: 2 },
    { type: "KVM Switch",     manufacturer: "Raritan", model: "DSX2-16",       count: 1 }
  ],
  "storage": [
    { type: "Network Device",  manufacturer: "Cisco",   model: "Nexus 93180",    count: 1 },
    { type: "Patch Panel",     manufacturer: "Panduit", model: "DP24",           count: 1 },
    { type: "Rack PDU",        manufacturer: "APC",     model: "AP8681",         count: 2 },
    { type: "Network Storage", manufacturer: "HPE",     model: "Alletra 9060",   count: 3 },
    { type: "Network Storage", manufacturer: "NetApp",  model: "AFF A400",       count: 2 }
  ],
  "edge": [
    { type: "Network Device", manufacturer: "Cisco",   model: "Catalyst 2960",  count: 2 },
    { type: "Patch Panel",    manufacturer: "Panduit", model: "DP24",           count: 1 },
    { type: "Rack PDU",       manufacturer: "APC",     model: "AP8681",         count: 1 },
    { type: "Server",         manufacturer: "Dell",    model: "PowerEdge R650", count: 4 }
  ]
}

type AdditionalSiteSpec = {
  code: string
  name: string
  address: string
  city: string
  postcode: string
  country: string
  notes?: string
  rooms: Array<{
    name: string
    type?: string
    cabinets: Array<{ name: string; profile: CabinetProfile; totalU?: number; powerKw?: number }>
  }>
}

const ADDITIONAL_SITES: AdditionalSiteSpec[] = [
  {
    code: "LDN",
    name: "London Docklands DC",
    address: "1 Dock Road",
    city: "London",
    postcode: "E14 5AB",
    country: "UK",
    notes: "Primary UK production facility — Tier III",
    rooms: [
      {
        name: "Hall A",
        cabinets: [
          { name: "A-01", profile: "compute-dense" },
          { name: "A-02", profile: "compute-dense" },
          { name: "A-03", profile: "compute-mix" },
          { name: "A-04", profile: "storage" }
        ]
      },
      {
        name: "Hall B",
        cabinets: [
          { name: "B-01", profile: "network-core", powerKw: 14 },
          { name: "B-02", profile: "compute-mix" },
          { name: "B-03", profile: "compute-mix" }
        ]
      }
    ]
  },
  {
    code: "MAN",
    name: "Manchester North DC",
    address: "Great Northern Tower",
    city: "Manchester",
    postcode: "M3 4EN",
    country: "UK",
    notes: "Regional DR facility",
    rooms: [
      {
        name: "Data Hall 1",
        cabinets: [
          { name: "MAN-01", profile: "compute-dense" },
          { name: "MAN-02", profile: "compute-mix" },
          { name: "MAN-03", profile: "storage" }
        ]
      },
      {
        name: "Comms Room",
        type: "COMMS_ROOM",
        cabinets: [
          { name: "COMMS-01", profile: "network-core", powerKw: 12 },
          { name: "COMMS-02", profile: "edge" }
        ]
      }
    ]
  },
  {
    code: "EDI",
    name: "Edinburgh Tech Park",
    address: "3 Lochside Avenue",
    city: "Edinburgh",
    postcode: "EH12 9DJ",
    country: "UK",
    notes: "Research & analytics workloads",
    rooms: [
      {
        name: "Primary Hall",
        cabinets: [
          { name: "EDI-01", profile: "compute-mix" },
          { name: "EDI-02", profile: "compute-mix" },
          { name: "EDI-03", profile: "storage" },
          { name: "EDI-04", profile: "edge" }
        ]
      }
    ]
  },
  {
    code: "LDS",
    name: "Leeds Campus",
    address: "Wellington Place",
    city: "Leeds",
    postcode: "LS1 4AP",
    country: "UK",
    notes: "Edge site — back-office and retail workloads",
    rooms: [
      {
        name: "Server Room",
        cabinets: [
          { name: "LDS-01", profile: "edge" },
          { name: "LDS-02", profile: "edge" },
          { name: "LDS-03", profile: "compute-mix" }
        ]
      }
    ]
  },
  {
    code: "SLW",
    name: "Slough West DC",
    address: "Buckingham Avenue",
    city: "Slough",
    postcode: "SL1 4QP",
    country: "UK",
    notes: "High-density colocation — Thames Valley cluster",
    rooms: [
      {
        name: "DC East",
        cabinets: [
          { name: "SLW-E01", profile: "compute-dense" },
          { name: "SLW-E02", profile: "compute-dense" },
          { name: "SLW-E03", profile: "compute-dense" },
          { name: "SLW-E04", profile: "storage" }
        ]
      },
      {
        name: "DC West",
        cabinets: [
          { name: "SLW-W01", profile: "network-core", powerKw: 14 },
          { name: "SLW-W02", profile: "compute-mix" }
        ]
      }
    ]
  }
]

function pickLifecycle(): AssetLifecycleState {
  const r = nextRand()
  if (r < 0.78) return AssetLifecycleState.ACTIVE
  if (r < 0.88) return AssetLifecycleState.PLANNED
  if (r < 0.94) return AssetLifecycleState.STAGING
  if (r < 0.98) return AssetLifecycleState.PROCUREMENT
  return AssetLifecycleState.RETIRED
}

function randomPastDate(minYearsAgo: number, maxYearsAgo: number): Date {
  const years = minYearsAgo + nextRand() * (maxYearsAgo - minYearsAgo)
  return new Date(Date.now() - years * 365 * 24 * 60 * 60 * 1000)
}

async function seedAdditionalSite(clientId: string, spec: AdditionalSiteSpec) {
  let dbSite = await prisma.site.findFirst({ where: { name: spec.name, clientId } })
  let siteCreated = false
  if (!dbSite) {
    dbSite = await prisma.site.create({
      data: {
        clientId,
        name: spec.name,
        address: spec.address,
        city: spec.city,
        postcode: spec.postcode,
        country: spec.country,
        notes: spec.notes
      }
    })
    siteCreated = true
    console.log(`   ✓ Created site: ${spec.name}`)
  } else {
    console.log(`   ↺ Site exists: ${spec.name}`)
  }

  const tagCounter: Record<string, number> = {}
  let assetsCreated = 0
  let assetsSkipped = 0

  for (const roomSpec of spec.rooms) {
    let room = await prisma.room.findFirst({ where: { name: roomSpec.name, siteId: dbSite.id } })
    if (!room) {
      room = await prisma.room.create({
        data: { name: roomSpec.name, siteId: dbSite.id, type: roomSpec.type ?? "DATA_HALL" }
      })
    }

    for (const cabSpec of roomSpec.cabinets) {
      let cabinet = await prisma.cabinet.findFirst({
        where: { name: cabSpec.name, siteId: dbSite.id, roomId: room.id }
      })
      if (!cabinet) {
        cabinet = await prisma.cabinet.create({
          data: {
            siteId: dbSite.id,
            roomId: room.id,
            name: cabSpec.name,
            type: "RACK",
            totalU: cabSpec.totalU ?? 42,
            powerKw: cabSpec.powerKw ?? 10
          }
        })
      }

      let uCursor = 1
      const cabTotalU = cabinet.totalU ?? 42

      for (const assetSpec of CABINET_ASSETS[cabSpec.profile]) {
        const prefix = TAG_PREFIX[assetSpec.type] ?? "AST"
        const keyspace = `${spec.code}-${prefix}`
        const uHeight = DEFAULT_U_HEIGHT[assetSpec.type] ?? 1

        for (let i = 0; i < assetSpec.count; i++) {
          tagCounter[keyspace] = (tagCounter[keyspace] ?? 0) + 1
          const assetTag = `${keyspace}-${tagCounter[keyspace].toString().padStart(4, "0")}`

          const existing = await prisma.asset.findUnique({ where: { assetTag } })
          if (existing) { assetsSkipped++; continue }

          let uPosition: number | null = null
          if (uHeight > 0 && uCursor + uHeight - 1 <= cabTotalU) {
            uPosition = uCursor
            uCursor += uHeight
          }

          const powerDrawW = estimatePowerDrawW(assetSpec.type, assetSpec.model)
          const serial = syntheticSerial(`${assetTag}|${assetSpec.manufacturer}|${assetSpec.model}`)
          const lifecycleState = pickLifecycle()
          const installDate = randomPastDate(0.5, 5)
          const warrantyYears = randInt(1, 5)
          const warrantyExpiry = new Date(installDate.getTime() + warrantyYears * 365 * 24 * 60 * 60 * 1000)

          await prisma.asset.create({
            data: {
              assetTag,
              name: assetTag,
              assetType: assetSpec.type,
              ownerType: OwnerType.CLIENT,
              clientId,
              siteId: dbSite.id,
              cabinetId: cabinet.id,
              manufacturer: assetSpec.manufacturer,
              modelNumber: assetSpec.model,
              serialNumber: serial,
              uHeight: uHeight > 0 ? uHeight : null,
              uPosition,
              powerDrawW: powerDrawW > 0 ? powerDrawW : null,
              status: "ACTIVE",
              lifecycleState,
              rackSide: "FRONT",
              installDate,
              warrantyExpiry
            }
          })
          assetsCreated++
        }
      }
    }
  }

  // Update usedU for this site's cabinets
  const siteCabinets = await prisma.cabinet.findMany({ where: { siteId: dbSite.id } })
  for (const cab of siteCabinets) {
    const racked = await prisma.asset.findMany({
      where: { cabinetId: cab.id, uPosition: { not: null } }
    })
    const usedU = racked.reduce((s, a) => s + (a.uHeight ?? 1), 0)
    await prisma.cabinet.update({ where: { id: cab.id }, data: { usedU } })
  }

  console.log(`     • ${spec.code}: ${assetsCreated} assets created, ${assetsSkipped} skipped`)
  return { siteCreated, assetsCreated, assetsSkipped }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())