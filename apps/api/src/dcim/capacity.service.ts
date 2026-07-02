import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { CapacityAsset, computeCabinetCapacity, effectiveBudgetW } from "./capacity.util"

// Capacity read model (DCIM_DESIGN_SPEC.md §4.3). Loads the hierarchy, maps rows to
// the pure engine, and shapes per-cabinet / per-site / overview responses. All
// read-only; tenant scope is enforced by the caller passing a validated clientId
// (and the site→client / cabinet→site→client chain in the queries).

const EXPIRING_WINDOW_DAYS = 14

const ASSET_SELECT = {
  id: true, uPosition: true, uHeight: true, isZeroU: true, isFullDepth: true,
  lifecycleState: true, powerDrawW: true, budgetedDrawW: true, weightKg: true,
  deviceType: { select: { excludeFromUtilization: true } },
} as const

type AssetRow = {
  uPosition: number | null; uHeight: number | null; isZeroU: boolean
  isFullDepth: boolean | null; lifecycleState: string
  powerDrawW: number | null; budgetedDrawW: number | null; weightKg: number | null
  deviceType: { excludeFromUtilization: boolean } | null
}

const toCapAsset = (a: AssetRow): CapacityAsset => ({
  uPosition: a.uPosition, uHeight: a.uHeight, isZeroU: a.isZeroU, isFullDepth: a.isFullDepth,
  lifecycleState: a.lifecycleState, powerDrawW: a.powerDrawW, budgetedDrawW: a.budgetedDrawW,
  weightKg: a.weightKg, excludeFromUtilization: a.deviceType?.excludeFromUtilization ?? false,
})

const pct = (value: number, capacity: number | null) =>
  capacity && capacity > 0 ? Math.round((value / capacity) * 100) : null

@Injectable()
export class CapacityService {
  constructor(private prisma: PrismaService) {}

  async getSiteCapacity(clientId: string, siteId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const site = await this.prisma.site.findFirst({ where: { id: siteId, clientId } })
    if (!site) throw new NotFoundException("Site not found")

    const cabinets = await this.prisma.cabinet.findMany({
      where: { siteId },
      orderBy: { name: "asc" },
      include: {
        assets: { select: ASSET_SELECT },
        reservations: true,
      },
    })

    const now = new Date()
    const rows = cabinets.map((c) => {
      const cap = computeCabinetCapacity(c, c.assets.map(toCapAsset))
      const activeReservations = c.reservations.filter((r) => !r.expiresAt || r.expiresAt > now).length
      const activeAssets = c.assets.filter((a) => a.lifecycleState !== "RETIRED").length
      return {
        cabinetId: c.id, name: c.name, roomId: c.roomId, totalU: c.totalU ?? 0,
        activeAssets, activeReservations, ...cap,
      }
    })

    const totalU = rows.reduce((s, r) => s + r.totalU, 0)
    const usedU = rows.reduce((s, r) => s + r.space.usedU, 0)
    const budgetedKw = rows.reduce((s, r) => s + r.power.value, 0)
    const capacityKw = cabinets.reduce((s, c) => s + (c.powerKw ?? 0), 0) || null
    const weightKg = rows.reduce((s, r) => s + r.weight.value, 0)
    const maxWeightKg = cabinets.reduce((s, c) => s + (c.maxWeightKg ?? 0), 0) || null

    return {
      siteId: site.id, name: site.name,
      totals: {
        cabinets: rows.length,
        activeAssets: rows.reduce((s, r) => s + r.activeAssets, 0),
        space: { usedU, totalU, pct: totalU > 0 ? Math.round((usedU / totalU) * 100) : 0 },
        power: { value: budgetedKw, capacity: capacityKw, pct: pct(budgetedKw, capacityKw) },
        weight: { value: weightKg, capacity: maxWeightKg, pct: pct(weightKg, maxWeightKg) },
        strandedCabinets: rows.filter((r) => r.stranded).length,
      },
      cabinets: rows,
    }
  }

  async getOverview(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")

    const sites = await this.prisma.site.findMany({
      where: { clientId },
      orderBy: { name: "asc" },
      include: { cabinets: { include: { assets: { select: ASSET_SELECT } } } },
    })

    const now = new Date()
    const topCabinets: { cabinetId: string; siteId: string; siteName: string; name: string; budgetedKw: number }[] = []
    let totCabinets = 0, totActive = 0, totUsedU = 0, totU = 0, totBudgetedKw = 0, totCapKw = 0, totStranded = 0

    const siteRows = sites.map((site) => {
      let sUsedU = 0, sTotalU = 0, sBudgetedKw = 0, sCapKw = 0, sWeight = 0, sMaxWeight = 0, sStranded = 0, sActive = 0
      for (const c of site.cabinets) {
        const cap = computeCabinetCapacity(c, c.assets.map(toCapAsset))
        sUsedU += cap.space.usedU; sTotalU += c.totalU ?? 0
        sBudgetedKw += cap.power.value; sCapKw += c.powerKw ?? 0
        sWeight += cap.weight.value; sMaxWeight += c.maxWeightKg ?? 0
        if (cap.stranded) sStranded++
        sActive += c.assets.filter((a) => a.lifecycleState !== "RETIRED").length
        topCabinets.push({ cabinetId: c.id, siteId: site.id, siteName: site.name, name: c.name, budgetedKw: cap.power.value })
      }
      totCabinets += site.cabinets.length; totActive += sActive
      totUsedU += sUsedU; totU += sTotalU; totBudgetedKw += sBudgetedKw; totCapKw += sCapKw; totStranded += sStranded
      return {
        siteId: site.id, name: site.name, cabinetCount: site.cabinets.length,
        space: { usedU: sUsedU, totalU: sTotalU, pct: sTotalU > 0 ? Math.round((sUsedU / sTotalU) * 100) : 0 },
        power: { value: sBudgetedKw, capacity: sCapKw || null, pct: pct(sBudgetedKw, sCapKw || null) },
        weight: { value: sWeight, capacity: sMaxWeight || null, pct: pct(sWeight, sMaxWeight || null) },
        strandedCabinets: sStranded,
      }
    })

    const expiring = new Date(now.getTime() + EXPIRING_WINDOW_DAYS * 86400_000)
    const expiringReservations = await this.prisma.cabinetReservation.count({
      where: { clientId, expiresAt: { gt: now, lte: expiring } },
    })

    return {
      totals: {
        sites: sites.length, cabinets: totCabinets, activeAssets: totActive,
        usedU: totUsedU, totalU: totU, spacePct: totU > 0 ? Math.round((totUsedU / totU) * 100) : 0,
        budgetedKw: totBudgetedKw, capacityKw: totCapKw || null, powerPct: pct(totBudgetedKw, totCapKw || null),
        strandedCabinets: totStranded, expiringReservations,
      },
      sites: siteRows,
      topCabinets: topCabinets.sort((a, b) => b.budgetedKw - a.budgetedKw).slice(0, 10),
    }
  }
}
