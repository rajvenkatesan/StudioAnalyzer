import { describe, it, expect } from 'vitest'
import { computePricePerClass } from '../../src/api/workers/discoveryRunner'

describe('computePricePerClass', () => {
  it('DROP_IN: returns price as-is', () => {
    expect(computePricePerClass('DROP_IN', 38)).toBe(38)
  })

  it('CLASS_PACK: divides by class count', () => {
    expect(computePricePerClass('CLASS_PACK', 300, 10)).toBe(30)
  })

  it('CLASS_PACK: returns null when classCount is 0', () => {
    expect(computePricePerClass('CLASS_PACK', 300, 0)).toBeNull()
  })

  it('CLASS_PACK: returns null when classCount is missing', () => {
    expect(computePricePerClass('CLASS_PACK', 300, undefined)).toBeNull()
  })

  it('MONTHLY: divides by 16 classes/month', () => {
    expect(computePricePerClass('MONTHLY', 200)).toBe(12.5)
  })

  it('ANNUAL: divides by 12 months then 16 classes', () => {
    // 1800 / 12 / 16 = 9.375 → rounded to 9.38
    expect(computePricePerClass('ANNUAL', 1800)).toBe(9.38)
  })

  it('unknown plan type: returns null', () => {
    expect(computePricePerClass('UNKNOWN', 100)).toBeNull()
  })
})
