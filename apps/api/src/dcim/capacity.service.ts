import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { CapacityAsset, computeCabinetCapacity, computePlaceableBlocks, effectiveBudgetW } from "./capacity.util"

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

  // Place-or-Reserve capacity search (DCIM_DESIGN_SPEC §6.1 Horizon 2): given
  // constraints, rank the client's cabinets BEST-FIT — the tightest placeable
  // block that satisfies everything wins (least waste → least fragmentation),
  // ties broken by post-placement power headroom. Placeable blocks use PHYSICAL
  // occupancy + active reservations (computePlaceableBlocks), not the accounting
  // freeBlocks. Power/weight are hard filters only when the cabinet declares a
  // capacity; unknown capacity ranks lower and is flagged (fits.power = null).
  async findSpace(clientId: string, dto: { uSize: number; budgetW?: number | null; weightKg?: number | null; siteId?: string | null }) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    if (dto.siteId) {
      const site = await this.prisma.site.findFirst({ where: { id: dto.siteId, clientId }, select: { id: true } })
      if (!site) throw new NotFoundException("Site not found")
    }

    const cabinets = await this.prisma.cabinet.findMany({
      where: { site: { clientId }, ...(dto.siteId ? { siteId: dto.siteId } : {}), totalU: { not: null } },
      include: {
        assets: { select: ASSET_SELECT },
        reservations: { select: { uStart: true, uHeight: true, expiresAt: true } },
        room: { select: { id: true, name: true } },
        site: { select: { id: true, name: true } },
      },
    })

    const now = new Date()
    const candidates = cabinets.flatMap((c) => {
      const capAssets = c.assets.map(toCapAsset)
      const blocks = computePlaceableBlocks(c.totalU ?? 0, c.startingUnit ?? 1, capAssets, c.reservations, now)
      const fitting = blocks.filter((b) => b.size >= dto.uSize)
      if (fitting.length === 0) return []
      // Best fit: the tightest block that still takes the kit.
      const bestBlock = fitting.reduce((m, b) => (b.size < m.size ? b : m))

      const cap = computeCabinetCapacity(c, capAssets)
      const capacityW = c.powerKw != null ? c.powerKw * 1000 : null
      const headroomW = capacityW != null ? capacityW - cap.power.value * 1000 : null
      const fitsPower = dto.budgetW ? (headroomW == null ? null : headroomW >= dto.budgetW) : true
      const weightHeadroomKg = c.maxWeightKg != null ? c.maxWeightKg - cap.weight.value : null
      const fitsWeight = dto.weightKg ? (weightHeadroomKg == null ? null : weightHeadroomKg >= dto.weightKg) : true
      if (fitsPower === false || fitsWeight === false) return []

      return [{
        cabinetId: c.id, name: c.name,
        siteId: c.site.id, siteName: c.site.name,
        roomId: c.room?.id ?? null, roomName: c.room?.name ?? null,
        totalU: c.totalU ?? 0,
        bestBlock, waste: bestBlock.size - dto.uSize,
        freeU: blocks.reduce((s, b) => s + b.size, 0),
        power: { budgetedKw: cap.power.value, capacityKw: c.powerKw, headroomW, pct: cap.power.pct },
        weight: { valueKg: cap.weight.value, capacityKg: c.maxWeightKg, headroomKg: weightHeadroomKg },
        fits: { space: true, power: fitsPower, weight: fitsWeight },
      }]
    })

    candidates.sort((a, b) =>
      a.waste - b.waste
      // Known headroom beats unknown; more headroom beats less.
      || (b.power.headroomW ?? -1) - (a.power.headroomW ?? -1)
      || a.name.localeCompare(b.name)
    )

    return { scanned: cabinets.length, matched: candidates.length, candidates: candidates.slice(0, 20) }
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
