import prisma from '../lib/prisma'
import { geocodeZipcode, deriveBoundaryRadius } from './geocode'
import { searchStudiosNearbyWithFixture, searchStudiosByName } from './places'
import { scrapeStudioWebsite, normalizeBrandName, derivePlanCategory, extractCommitmentMonths } from './scraper'
import type { ScrapedPricingRow } from './scraper'
import { DAYS_OF_WEEK, OPERATING_HOURS } from '../../shared/types'
import type { DayOfWeek } from '../../shared/types'

function buildPricingPlanData(studioId: number, p: ScrapedPricingRow) {
  const planCategory = derivePlanCategory(p.planType, p.planName)
  const commitmentMonths = p.commitmentMonths ?? extractCommitmentMonths(p.planType, p.planName, p.notes)
  const isPartial = (planCategory == null) || (planCategory === 'PACKS' && (p.classCount == null))
  return {
    studioId,
    planName: p.planName,
    planType: p.planType,
    planCategory,
    priceAmount: p.priceAmount,
    currency: p.currency,
    classCount: p.classCount,
    commitmentMonths,
    validityDays: p.validityDays,
    pricePerClass: computePricePerClass(p.planType, p.priceAmount, p.classCount),
    isPartial,
    notes: p.notes,
    scrapedAt: new Date(),
  }
}

// In-memory cancellation tokens — keyed by runId.
// Checked at the start of each place-processing iteration.
const cancelledRuns = new Set<number>()

export function cancelRun(runId: number): void {
  cancelledRuns.add(runId)
}

// Classes/month assumed for unlimited pricing normalization
const UNLIMITED_CLASSES_PER_MONTH = 16

/**
 * Compute the normalized price-per-class for a pricing plan.
 * Returns null if computation isn't possible.
 */
export function computePricePerClass(
  planType: string,
  priceAmount: number,
  classCount?: number | null
): number | null {
  switch (planType) {
    case 'DROP_IN':
      return round2(priceAmount)
    case 'CLASS_PACK':
      if (!classCount || classCount <= 0) return null
      return round2(priceAmount / classCount)
    case 'MONTHLY':
      return round2(priceAmount / UNLIMITED_CLASSES_PER_MONTH)
    case 'ANNUAL':
      return round2(priceAmount / 12 / UNLIMITED_CLASSES_PER_MONTH)
    default:
      return null
  }
}

/**
 * Compute utilization rate. Returns null if data is unavailable.
 */
export function computeUtilizationRate(
  spotsAvailable: number | null | undefined,
  totalSpots: number | null | undefined
): number | null {
  if (spotsAvailable == null || totalSpots == null || totalSpots === 0) return null
  return round2((totalSpots - spotsAvailable) / totalSpots)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Main discovery orchestrator. Called from the POST /discovery/run route.
 * Runs entirely async — updates DiscoveryRun status as it progresses.
 */
export async function runDiscovery(runId: number): Promise<void> {
  await prisma.discoveryRun.update({
    where: { id: runId },
    data: { status: 'RUNNING' },
  })

  const run = await prisma.discoveryRun.findUniqueOrThrow({ where: { id: runId } })

  try {
    // 1. Geocode zipcode
    const geocoded = await geocodeZipcode(run.zipcode)
    const radiusMeters = deriveBoundaryRadius(geocoded.boundingBox)

    // 2. Search Google Places
    const places = await searchStudiosNearbyWithFixture(
      geocoded,
      radiusMeters,
      run.searchQuery,
      run.zipcode
    )

    let studiosFound = 0
    let locationsFound = 0
    let newLocations = 0
    let updatedLocations = 0

    // 3. For each place, upsert Studio + Location, then scrape
    for (const place of places) {
      if (cancelledRuns.has(runId)) {
        cancelledRuns.delete(runId)
        await prisma.discoveryRun.update({
          where: { id: runId },
          data: { status: 'CANCELLED', completedAt: new Date(), studiosFound, newLocations, updatedLocations, locationsFound },
        })
        return
      }

      const normalized = normalizeBrandName(place.name)

      // Upsert StudioType based on search query
      const studioType = await prisma.studioType.upsert({
        where: { slug: normalizeBrandName(run.searchQuery) },
        create: {
          name: run.searchQuery,
          slug: normalizeBrandName(run.searchQuery),
        },
        update: {},
      })

      // Upsert Studio
      const studio = await prisma.studio.upsert({
        where: {
          normalizedBrand_studioTypeId: {
            normalizedBrand: normalized,
            studioTypeId: studioType.id,
          },
        },
        create: {
          studioTypeId: studioType.id,
          name: place.name,
          normalizedBrand: normalized,
          websiteUrl: place.websiteUrl,
          phone: place.phone,
        },
        update: {
          websiteUrl: place.websiteUrl,
          phone: place.phone,
          updatedAt: new Date(),
        },
      })

      studiosFound++

      // Upsert Location by googlePlaceId (primary) or composite key (fallback)
      let existingLocation = await prisma.location.findUnique({
        where: { googlePlaceId: place.googlePlaceId },
      })

      if (!existingLocation) {
        // Fallback: match by brand + address + postalCode
        existingLocation = await prisma.location.findFirst({
          where: {
            studioId: studio.id,
            addressLine1: place.addressComponents.addressLine1,
            postalCode: place.addressComponents.postalCode,
          },
        })
      }

      let location: typeof existingLocation
      const locationData = {
        addressLine1: place.addressComponents.addressLine1,
        city: place.addressComponents.city,
        state: place.addressComponents.state,
        postalCode: place.addressComponents.postalCode,
        latitude: place.lat,
        longitude: place.lng,
        googlePlaceId: place.googlePlaceId,
        updatedAt: new Date(),
      }

      if (existingLocation) {
        location = await prisma.location.update({
          where: { id: existingLocation.id },
          data: locationData,
        })
        updatedLocations++
      } else {
        location = await prisma.location.create({
          data: { studioId: studio.id, ...locationData },
        })
        newLocations++
      }

      locationsFound++

      // 4. Always clear existing scraped data so re-discovery force-updates everything
      await prisma.hoursOfOperation.deleteMany({ where: { locationId: location.id } })
      await prisma.classSchedule.deleteMany({ where: { locationId: location.id } })
      await prisma.classUtilization.deleteMany({ where: { locationId: location.id } })
      await prisma.pricingPlan.deleteMany({ where: { studioId: studio.id } })

      // 5. Scrape website if available and re-insert fresh data
      if (place.websiteUrl) {
        const scraped = await scrapeStudioWebsite(place.websiteUrl, normalized)

        // 5a. Re-insert HoursOfOperation
        if (scraped.hoursDataAvailable) {
          const hourRows = buildHoursRows(location.id, scraped.hoursOfOperation)
          if (hourRows.length > 0) {
            await prisma.hoursOfOperation.createMany({ data: hourRows })
          }
        } else {
          // Insert all slots as isOpen=false to record that hours were checked but unavailable
          await prisma.hoursOfOperation.createMany({
            data: buildEmptyHoursRows(location.id),
          })
        }

        // 5b. Re-insert ClassSchedule
        if (scraped.scheduleDataAvailable && scraped.schedule.length > 0) {
          const created = await Promise.all(
            scraped.schedule.map((s) =>
              prisma.classSchedule.create({
                data: {
                  locationId: location!.id,
                  discoveryRunId: runId,
                  className: s.className,
                  dayOfWeek: s.dayOfWeek,
                  startTime: s.startTime,
                  durationMinutes: s.durationMinutes,
                  instructor: s.instructor,
                  totalSpots: s.totalSpots,
                },
              })
            )
          )

          // 5c. Append ClassUtilization snapshots
          await prisma.classUtilization.createMany({
            data: created.map((cs, i) => ({
              classScheduleId: cs.id,
              locationId: location!.id,
              discoveryRunId: runId,
              dayOfWeek: cs.dayOfWeek,
              startTime: cs.startTime,
              spotsAvailable: scraped.schedule[i].spotsAvailable ?? null,
              totalSpots: scraped.schedule[i].totalSpots ?? null,
              dataAvailable: scraped.schedule[i].dataAvailable,
              observedAt: new Date(),
            })),
          })
        }

        // 5d. Re-insert PricingPlans
        if (scraped.pricingDataAvailable && scraped.pricing.length > 0) {
          await prisma.pricingPlan.createMany({
            data: scraped.pricing.map((p) => buildPricingPlanData(studio.id, p)),
          })
        }

        // Update location status if the scraper detected Open/Upcoming
        if (scraped.studioStatus && scraped.studioStatus !== 'unknown') {
          await prisma.location.update({
            where: { id: location.id },
            data: { status: scraped.studioStatus },
          })
        }

        // Log warning if scraping was blocked
        if (scraped.warningMessage) {
          await prisma.discoveryRun.update({
            where: { id: runId },
            data: {
              errorMessage: [run.errorMessage, scraped.warningMessage]
                .filter(Boolean)
                .join('; '),
            },
          })
        }
      }
    }

    // 5. Mark run complete
    await prisma.discoveryRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        studiosFound,
        locationsFound,
        newLocations,
        updatedLocations,
        completedAt: new Date(),
      },
    })
  } catch (err: any) {
    await prisma.discoveryRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        errorMessage: err?.message ?? String(err),
        completedAt: new Date(),
      },
    })
    throw err
  }
}

/**
 * Franchise discovery: search for all US locations of a named studio brand
 * without restricting to a zipcode. Uses Google Places Text Search.
 */
export async function runFranchiseDiscovery(runId: number): Promise<void> {
  await prisma.discoveryRun.update({
    where: { id: runId },
    data: { status: 'RUNNING' },
  })

  const run = await prisma.discoveryRun.findUniqueOrThrow({ where: { id: runId } })

  try {
    const places = await searchStudiosByName(run.searchQuery)

    let studiosFound = 0
    let locationsFound = 0
    let newLocations = 0
    let updatedLocations = 0

    for (const place of places) {
      if (cancelledRuns.has(runId)) {
        cancelledRuns.delete(runId)
        await prisma.discoveryRun.update({
          where: { id: runId },
          data: { status: 'CANCELLED', completedAt: new Date(), studiosFound, newLocations, updatedLocations, locationsFound },
        })
        return
      }

      const normalized = normalizeBrandName(place.name)

      const studioType = await prisma.studioType.upsert({
        where: { slug: normalizeBrandName(run.searchQuery) },
        create: {
          name: run.searchQuery,
          slug: normalizeBrandName(run.searchQuery),
        },
        update: {},
      })

      const studio = await prisma.studio.upsert({
        where: {
          normalizedBrand_studioTypeId: {
            normalizedBrand: normalized,
            studioTypeId: studioType.id,
          },
        },
        create: {
          studioTypeId: studioType.id,
          name: place.name,
          normalizedBrand: normalized,
          websiteUrl: place.websiteUrl,
          phone: place.phone,
        },
        update: {
          websiteUrl: place.websiteUrl,
          phone: place.phone,
          updatedAt: new Date(),
        },
      })

      studiosFound++

      let existingLocation = await prisma.location.findUnique({
        where: { googlePlaceId: place.googlePlaceId },
      })

      if (!existingLocation) {
        existingLocation = await prisma.location.findFirst({
          where: {
            studioId: studio.id,
            addressLine1: place.addressComponents.addressLine1,
            postalCode: place.addressComponents.postalCode,
          },
        })
      }

      let location: typeof existingLocation
      const locationData = {
        addressLine1: place.addressComponents.addressLine1,
        city: place.addressComponents.city,
        state: place.addressComponents.state,
        postalCode: place.addressComponents.postalCode,
        latitude: place.lat,
        longitude: place.lng,
        googlePlaceId: place.googlePlaceId,
        updatedAt: new Date(),
      }

      if (existingLocation) {
        location = await prisma.location.update({
          where: { id: existingLocation.id },
          data: locationData,
        })
        updatedLocations++
      } else {
        location = await prisma.location.create({
          data: { studioId: studio.id, ...locationData },
        })
        newLocations++
      }

      locationsFound++

      // Always clear existing scraped data
      await prisma.hoursOfOperation.deleteMany({ where: { locationId: location.id } })
      await prisma.classSchedule.deleteMany({ where: { locationId: location.id } })
      await prisma.classUtilization.deleteMany({ where: { locationId: location.id } })
      await prisma.pricingPlan.deleteMany({ where: { studioId: studio.id } })

      if (place.websiteUrl) {
        const scraped = await scrapeStudioWebsite(place.websiteUrl, normalized)

        if (scraped.hoursDataAvailable) {
          const hourRows = buildHoursRows(location.id, scraped.hoursOfOperation)
          if (hourRows.length > 0) {
            await prisma.hoursOfOperation.createMany({ data: hourRows })
          }
        } else {
          await prisma.hoursOfOperation.createMany({ data: buildEmptyHoursRows(location.id) })
        }

        if (scraped.scheduleDataAvailable && scraped.schedule.length > 0) {
          const created = await Promise.all(
            scraped.schedule.map((s) =>
              prisma.classSchedule.create({
                data: {
                  locationId: location!.id,
                  discoveryRunId: runId,
                  className: s.className,
                  dayOfWeek: s.dayOfWeek,
                  startTime: s.startTime,
                  durationMinutes: s.durationMinutes,
                  instructor: s.instructor,
                  totalSpots: s.totalSpots,
                },
              })
            )
          )
          await prisma.classUtilization.createMany({
            data: created.map((cs, i) => ({
              classScheduleId: cs.id,
              locationId: location!.id,
              discoveryRunId: runId,
              dayOfWeek: cs.dayOfWeek,
              startTime: cs.startTime,
              spotsAvailable: scraped.schedule[i].spotsAvailable ?? null,
              totalSpots: scraped.schedule[i].totalSpots ?? null,
              dataAvailable: scraped.schedule[i].dataAvailable,
              observedAt: new Date(),
            })),
          })
        }

        if (scraped.pricingDataAvailable && scraped.pricing.length > 0) {
          await prisma.pricingPlan.createMany({
            data: scraped.pricing.map((p) => buildPricingPlanData(studio.id, p)),
          })
        }
      }
    }

    await prisma.discoveryRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        studiosFound,
        locationsFound,
        newLocations,
        updatedLocations,
        completedAt: new Date(),
      },
    })
  } catch (err: any) {
    await prisma.discoveryRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        errorMessage: err?.message ?? String(err),
        completedAt: new Date(),
      },
    })
    throw err
  }
}

/**
 * Refresh: re-scrape pricing, schedule, and hours for a specific set of studios
 * without running a new Google Places search. Uses the studios' existing websiteUrl.
 */
export async function runRefresh(runId: number, studioIds: number[]): Promise<void> {
  await prisma.discoveryRun.update({
    where: { id: runId },
    data: { status: 'RUNNING' },
  })

  try {
    const studios = await prisma.studio.findMany({
      where: { id: { in: studioIds } },
      include: { locations: true },
    })

    let studiosFound = 0
    let updatedLocations = 0

    for (const studio of studios) {
      if (cancelledRuns.has(runId)) {
        cancelledRuns.delete(runId)
        await prisma.discoveryRun.update({
          where: { id: runId },
          data: { status: 'CANCELLED', completedAt: new Date(), studiosFound, updatedLocations, locationsFound: updatedLocations, newLocations: 0 },
        })
        return
      }

      studiosFound++

      // Clear studio-level pricing once before processing any of its locations,
      // so location 2's scrape doesn't wipe the pricing that location 1 just inserted.
      await prisma.pricingPlan.deleteMany({ where: { studioId: studio.id } })

      for (const location of studio.locations) {
        // Clear location-level scraped data before re-scraping this location
        // ClassUtilization references ClassSchedule so must be deleted first
        await prisma.classUtilization.deleteMany({ where: { locationId: location.id } })
        await prisma.classSchedule.deleteMany({ where: { locationId: location.id } })
        await prisma.hoursOfOperation.deleteMany({ where: { locationId: location.id } })

        if (studio.websiteUrl) {
          const scraped = await scrapeStudioWebsite(studio.websiteUrl, studio.normalizedBrand)

          if (scraped.hoursDataAvailable) {
            const hourRows = buildHoursRows(location.id, scraped.hoursOfOperation)
            if (hourRows.length > 0) {
              await prisma.hoursOfOperation.createMany({ data: hourRows })
            }
          } else {
            await prisma.hoursOfOperation.createMany({ data: buildEmptyHoursRows(location.id) })
          }

          if (scraped.scheduleDataAvailable && scraped.schedule.length > 0) {
            const created = await Promise.all(
              scraped.schedule.map((s) =>
                prisma.classSchedule.create({
                  data: {
                    locationId: location.id,
                    discoveryRunId: runId,
                    className: s.className,
                    dayOfWeek: s.dayOfWeek,
                    startTime: s.startTime,
                    durationMinutes: s.durationMinutes,
                    instructor: s.instructor,
                    totalSpots: s.totalSpots,
                  },
                })
              )
            )
            await prisma.classUtilization.createMany({
              data: created.map((cs, i) => ({
                classScheduleId: cs.id,
                locationId: location.id,
                discoveryRunId: runId,
                dayOfWeek: cs.dayOfWeek,
                startTime: cs.startTime,
                spotsAvailable: scraped.schedule[i].spotsAvailable ?? null,
                totalSpots: scraped.schedule[i].totalSpots ?? null,
                dataAvailable: scraped.schedule[i].dataAvailable,
                observedAt: new Date(),
              })),
            })
          }

          if (scraped.pricingDataAvailable && scraped.pricing.length > 0) {
            await prisma.pricingPlan.createMany({
              data: scraped.pricing.map((p) => buildPricingPlanData(studio.id, p)),
            })
          }

          // Update location status if the scraper detected Open/Upcoming
          if (scraped.studioStatus && scraped.studioStatus !== 'unknown') {
            await prisma.location.update({
              where: { id: location.id },
              data: { status: scraped.studioStatus },
            })
          }

          if (scraped.warningMessage) {
            const current = await prisma.discoveryRun.findUnique({
              where: { id: runId },
              select: { errorMessage: true },
            })
            await prisma.discoveryRun.update({
              where: { id: runId },
              data: {
                errorMessage: [current?.errorMessage, scraped.warningMessage]
                  .filter(Boolean)
                  .join('; '),
              },
            })
          }
        }

        updatedLocations++
      }

      // Update studio timestamp
      await prisma.studio.update({
        where: { id: studio.id },
        data: { updatedAt: new Date() },
      })
    }

    await prisma.discoveryRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        studiosFound,
        locationsFound: updatedLocations,
        newLocations: 0,
        updatedLocations,
        completedAt: new Date(),
      },
    })
  } catch (err: any) {
    await prisma.discoveryRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        errorMessage: err?.message ?? String(err),
        completedAt: new Date(),
      },
    })
    throw err
  }
}

// ── Hours helpers ─────────────────────────────────────────────────────────────

function buildHoursRows(
  locationId: number,
  hoursMap: Record<DayOfWeek, { open: number; close: number } | null>
) {
  const rows: Array<{ locationId: number; dayOfWeek: DayOfWeek; hour: number; isOpen: boolean }> = []
  for (const day of DAYS_OF_WEEK) {
    const hours = hoursMap[day]
    for (const hour of OPERATING_HOURS) {
      rows.push({
        locationId,
        dayOfWeek: day,
        hour,
        isOpen: hours !== null && hour >= hours.open && hour < hours.close,
      })
    }
  }
  return rows
}

function buildEmptyHoursRows(locationId: number) {
  return buildHoursRows(locationId, {
    MON: null, TUE: null, WED: null, THU: null, FRI: null, SAT: null, SUN: null,
  })
}
