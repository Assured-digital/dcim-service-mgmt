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

import { PrismaClient, OwnerType } from "@prisma/client"
import { readFileSync, existsSync } from "fs"
import { join } from "path"

const prisma = new PrismaClient()

// ─── Configuration ───────────────────────────────────────────────────

const ORG_ID = "00000000-0000-0000-0000-000000000001" // matches base seed.ts
const CLIENT_NAME = "University of Testing"
const SITE_NAME = "Main Data Centre"
const SITE_CITY = "Bristol"
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
        city: SITE_CITY,
        country: SITE_COUNTRY,
        notes: "Demo site populated from sanitised real-world export"
      }
    })
    console.log(`   ✓ Created site: ${SITE_NAME}`)
  } else {
    console.log(`   ↺ Found existing site: ${SITE_NAME}`)
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

  console.log("✅ Demo estate seed complete")
  console.log(`   Client: ${client.name}`)
  console.log(`   Site: ${site.name} (${roomMap.size} rooms, ${cabinetMap.size} cabinets)`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())