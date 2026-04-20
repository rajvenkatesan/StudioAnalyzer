import { describe, it, expect } from 'vitest'
import { computeUtilizationRate } from '../../src/api/workers/discoveryRunner'

describe('computeUtilizationRate', () => {
  it('computes rate correctly', () => {
    // 9 taken out of 12 = 0.75
    expect(computeUtilizationRate(3, 12)).toBe(0.75)
  })

  it('returns 0 when all spots available', () => {
    expect(computeUtilizationRate(12, 12)).toBe(0)
  })

  it('returns 1.0 when no spots available (fully booked)', () => {
    expect(computeUtilizationRate(0, 12)).toBe(1)
  })

  it('returns null when spotsAvailable is null (data unavailable)', () => {
    expect(computeUtilizationRate(null, 12)).toBeNull()
  })

  it('returns null when totalSpots is null', () => {
    expect(computeUtilizationRate(3, null)).toBeNull()
  })

  it('returns null when totalSpots is 0 (avoid divide-by-zero)', () => {
    expect(computeUtilizationRate(0, 0)).toBeNull()
  })

  it('returns null when both are null', () => {
    expect(computeUtilizationRate(null, null)).toBeNull()
  })
})
