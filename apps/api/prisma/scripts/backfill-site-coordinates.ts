/**
 * Backfill Site Coordinates
 * ─────────────────────────
 * Looks up every Site missing latitude/longitude, asks Nominatim for coords
 * derived from address + city + postcode + country, and writes them back.
 *
 * Run:  pnpm --filter api geocode:sites
 *
 * Idempotent: sites that already have coordinates are skipped. Run again after
 * adding addresses to see the new pins appear on the Asset Hierarchy overview
 * map.
 */

import { PrismaClient } from "@prisma/client"
import { GeocodingService } from "../../src/sites/geocoding.service"

const prisma = new PrismaClient()
const geocoder = new GeocodingService()

async function main() {
  console.log("── Backfill site coordinates ──")

  const sites = await prisma.site.findMany({
    where: { OR: [{ latitude: null }, { longitude: null }] },
    orderBy: { name: "asc" }
  })

  if (sites.length === 0) {
    console.log("All sites already have coordinates. Nothing to do.")
    return
  }

  console.log(`Found ${sites.length} site(s) without coordinates.\n`)

  let resolved = 0
  let missed = 0

  for (const site of sites) {
    const geo = await geocoder.geocodeAddress({
      address: site.address,
      city: site.city,
      postcode: site.postcode,
      country: site.country
    })

    if (geo) {
      await prisma.site.update({
        where: { id: site.id },
        data: { latitude: geo.lat, longitude: geo.lon, geocodedAt: new Date() }
      })
      console.log(`   ✓ ${site.name} → ${geo.lat.toFixed(4)}, ${geo.lon.toFixed(4)}`)
      resolved++
    } else {
      console.log(`   ✗ ${site.name} (no result)`)
      missed++
    }
  }

  console.log(`\nDone. Resolved ${resolved}, missed ${missed}.`)
}

main()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
