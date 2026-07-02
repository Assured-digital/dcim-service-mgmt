import { CapacityAsset, computeCabinetCapacity, computeSpace, effectiveBudgetW } from "./capacity.util"

const asset = (p: Partial<CapacityAsset>): CapacityAsset => ({
  uPosition: null, uHeight: null, isZeroU: false, isFullDepth: true,
  lifecycleState: "ACTIVE", powerDrawW: null, budgetedDrawW: null, weightKg: null,
  excludeFromUtilization: false, ...p,
})

describe("effectiveBudgetW", () => {
  it("prefers explicit budget", () => {
    expect(effectiveBudgetW(asset({ budgetedDrawW: 500, powerDrawW: 1000 }))).toBe(500)
  })
  it("derates nameplate when no budget (default 60%)", () => {
    expect(effectiveBudgetW(asset({ powerDrawW: 1000 }))).toBe(600)
  })
  it("is 0 with no power data", () => {
    expect(effectiveBudgetW(asset({}))).toBe(0)
  })
})

describe("computeSpace", () => {
  it("counts occupied units and finds the largest contiguous free block", () => {
    // 10U cabinet, a 2U device at U5-6 → used 2, free 8, largest run is U7-10 (4U)
    const s = computeSpace(10, 1, [asset({ uPosition: 5, uHeight: 2 })])
    expect(s.usedU).toBe(2)
    expect(s.freeU).toBe(8)
    expect(s.pct).toBe(20)
    expect(s.largestContiguousU).toBe(4)
  })
  it("excludes retired, zero-U, and excludeFromUtilization assets", () => {
    const s = computeSpace(10, 1, [
      asset({ uPosition: 1, uHeight: 1, lifecycleState: "RETIRED" }),
      asset({ uPosition: 2, uHeight: 1, isZeroU: true }),
      asset({ uPosition: 3, uHeight: 1, excludeFromUtilization: true }),
      asset({ uPosition: 4, uHeight: 1 }),
    ])
    expect(s.usedU).toBe(1) // only the plain ACTIVE one counts
  })
  it("honours startingUnit", () => {
    const s = computeSpace(5, 10, [asset({ uPosition: 10, uHeight: 1 })])
    expect(s.usedU).toBe(1)
    expect(s.largestContiguousU).toBe(4) // U11-14 free
  })
})

describe("computeCabinetCapacity", () => {
  const cab = { totalU: 42, startingUnit: 1, powerKw: 8, maxWeightKg: 900 }
  it("sums budgeted power (kW) and weight, excluding retired", () => {
    const cap = computeCabinetCapacity(cab, [
      asset({ uPosition: 1, uHeight: 1, budgetedDrawW: 500, weightKg: 20 }),
      asset({ uPosition: 2, uHeight: 1, powerDrawW: 1000, weightKg: 10 }), // → 600W budgeted
      asset({ uPosition: 3, uHeight: 1, budgetedDrawW: 9999, weightKg: 99, lifecycleState: "RETIRED" }),
    ])
    expect(cap.power.value).toBeCloseTo(1.1) // (500 + 600) / 1000
    expect(cap.power.pct).toBe(14) // 1.1 / 8
    expect(cap.weight.value).toBe(30)
  })
  it("flags stranded space: full on U, empty on power", () => {
    // Fill 40/42 U with near-zero-power kit → space red, power tiny
    const assets = Array.from({ length: 40 }, (_, i) => asset({ uPosition: i + 1, uHeight: 1, powerDrawW: 10 }))
    const cap = computeCabinetCapacity(cab, assets)
    expect(cap.space.pct).toBeGreaterThanOrEqual(85)
    expect(cap.stranded).toBe("space")
  })
  it("null power pct when the cabinet has no feed capacity", () => {
    const cap = computeCabinetCapacity({ ...cab, powerKw: null }, [asset({ uPosition: 1, budgetedDrawW: 500 })])
    expect(cap.power.pct).toBeNull()
    expect(cap.stranded).toBeNull()
  })
})
