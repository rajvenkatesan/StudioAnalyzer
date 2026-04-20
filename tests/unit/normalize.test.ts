import { describe, it, expect } from 'vitest'
import { normalizeBrandName, parseTimeSlot } from '../../src/api/workers/scraper'
import { geocodeZipcode, deriveBoundaryRadius } from '../../src/api/workers/geocode'

describe('normalizeBrandName', () => {
  it('lowercases and strips special characters', () => {
    expect(normalizeBrandName('SolidCore®')).toBe('solidcore')
  })

  it('strips trademark symbol', () => {
    expect(normalizeBrandName('Core40™')).toBe('core40')
  })

  it('handles plain names', () => {
    expect(normalizeBrandName('Yoga Studio')).toBe('yogastudio')
  })

  it('handles already normalized input', () => {
    expect(normalizeBrandName('solidcore')).toBe('solidcore')
  })
})

describe('parseTimeSlot', () => {
  it('parses 12-hour AM format', () => {
    expect(parseTimeSlot('7:00 AM')).toBe('07:00')
  })

  it('parses 12-hour PM format', () => {
    expect(parseTimeSlot('6:30 PM')).toBe('18:30')
  })

  it('handles 12 PM (noon) correctly', () => {
    expect(parseTimeSlot('12:00 PM')).toBe('12:00')
  })

  it('handles 12 AM (midnight) correctly', () => {
    expect(parseTimeSlot('12:00 AM')).toBe('00:00')
  })

  it('returns 00:00 for unrecognized format', () => {
    expect(parseTimeSlot('morning')).toBe('00:00')
  })
})

describe('deriveBoundaryRadius', () => {
  it('returns a positive number', () => {
    const radius = deriveBoundaryRadius({
      northeast: { lat: 37.80, lng: -122.36 },
      southwest: { lat: 37.76, lng: -122.42 },
    })
    expect(radius).toBeGreaterThan(0)
  })

  it('caps at 8000 meters for large bounding boxes', () => {
    const radius = deriveBoundaryRadius({
      northeast: { lat: 40.0, lng: -70.0 },
      southwest: { lat: 30.0, lng: -80.0 },
    })
    expect(radius).toBe(8_000)
  })
})
