import type { FanConfig, RecoveryOffer, SupplyConfig, Tier } from './types'

export interface SpendEvent {
  minute: number
  guildId: string
  playerId: string
  tier: Tier
  offerId: string
  usd: number
  diamonds: number
  ads: number
}

export interface RecoveryActor {
  guildId: string
  playerId: string
  tier: Tier
}

export interface ActiveRecoveryProgram {
  offerId: string
  startMinute: number
  endMinute: number
}

export interface QueuedOffer {
  offerId: string
  purchasedMinute: number
}

export interface ScheduledPulse {
  offerId: string
  minute: number
  rate: number
}

export interface EconomyState {
  availableFans: number
  capacity: number
  fractionalFansBySource: Record<string, number>
  activeProgram: ActiveRecoveryProgram | null
  queue: QueuedOffer[]
  scheduledPulses: ScheduledPulse[]
  wastedFans: number
  wastedBySource: Record<string, number>
  theoreticalBySource: Record<string, number>
  recoveredBySource: Record<string, number>
  spendLedger: SpendEvent[]
}

function cloneState(state: EconomyState): EconomyState {
  return {
    ...state,
    fractionalFansBySource: { ...state.fractionalFansBySource },
    activeProgram: state.activeProgram ? { ...state.activeProgram } : null,
    queue: state.queue.map((entry) => ({ ...entry })),
    scheduledPulses: state.scheduledPulses.map((pulse) => ({ ...pulse })),
    wastedBySource: { ...state.wastedBySource },
    theoreticalBySource: { ...state.theoreticalBySource },
    recoveredBySource: { ...state.recoveredBySource },
    spendLedger: state.spendLedger.map((event) => ({ ...event })),
  }
}

function addToRecord(record: Record<string, number>, key: string, value: number) {
  record[key] = (record[key] ?? 0) + value
}

function applyProducedFans(
  state: EconomyState,
  sourceId: string,
  producedNow: number,
) {
  if (!(producedNow > 0)) return

  const theoretical = (state.fractionalFansBySource[sourceId] ?? 0) + producedNow
  const wholeFans = Math.floor(theoretical + 1e-9)
  const room = Math.max(0, state.capacity - state.availableFans)
  const accepted = Math.min(wholeFans, room)
  const fillsPool = accepted === room
  const wasted = fillsPool ? theoretical - accepted : wholeFans - accepted

  state.fractionalFansBySource[sourceId] = fillsPool
    ? 0
    : theoretical - wholeFans
  state.availableFans += accepted
  state.wastedFans += wasted
  addToRecord(state.wastedBySource, sourceId, wasted)
  addToRecord(state.theoreticalBySource, sourceId, producedNow)
  addToRecord(state.recoveredBySource, sourceId, accepted)
}

function findOffer(supply: SupplyConfig, offerId: string): RecoveryOffer {
  const offer = supply.offers.find((candidate) => candidate.id === offerId)
  if (!offer) throw new Error(`Unknown recovery offer: ${offerId}`)
  return offer
}

function startProgram(
  state: EconomyState,
  offer: RecoveryOffer,
  minute: number,
) {
  state.activeProgram = {
    offerId: offer.id,
    startMinute: minute,
    endMinute: minute + offer.durationMinutes,
  }
  state.scheduledPulses.push(
    ...offer.pulseCapacityRates.map((pulse) => ({
      offerId: offer.id,
      minute: minute + pulse.afterMinutes,
      rate: pulse.rate,
    })),
  )
  state.scheduledPulses.sort((a, b) => a.minute - b.minute)
  applyProducedFans(
    state,
    offer.id,
    state.capacity * offer.immediateCapacityRate,
  )
}

export function createEconomyState(
  availableFans: number,
  capacity: number,
): EconomyState {
  const safeCapacity = Math.max(0, Math.floor(capacity))
  return {
    availableFans: Math.min(safeCapacity, Math.max(0, Math.floor(availableFans))),
    capacity: safeCapacity,
    fractionalFansBySource: {},
    activeProgram: null,
    queue: [],
    scheduledPulses: [],
    wastedFans: 0,
    wastedBySource: {},
    theoreticalBySource: {},
    recoveredBySource: {},
    spendLedger: [],
  }
}

export function activateOffer(
  state: EconomyState,
  offerId: string,
  minute: number,
  supply: SupplyConfig,
  actor: RecoveryActor,
): EconomyState {
  const next = cloneState(state)
  const offer = findOffer(supply, offerId)
  next.spendLedger.push({
    minute,
    ...actor,
    offerId,
    usd: offer.usdCost,
    diamonds: offer.diamondCost,
    ads: offer.adCost,
  })

  if (offer.mode === 'instant') {
    applyProducedFans(next, offer.id, offer.fixedFans)
  } else if (next.activeProgram) {
    next.queue.push({ offerId, purchasedMinute: minute })
  } else {
    startProgram(next, offer, minute)
  }

  return next
}

function accrueContinuous(
  state: EconomyState,
  elapsedMinutes: number,
  fans: FanConfig,
  supply: SupplyConfig,
) {
  if (!(elapsedMinutes > 0)) return

  const sources: Array<{ id: string; ratePerMinute: number }> = [{
    id: 'natural',
    ratePerMinute: state.capacity * fans.naturalCapacityPerDay / 1440,
  }]
  if (state.activeProgram) {
    const offer = findOffer(supply, state.activeProgram.offerId)
    if (offer.durationMinutes > 0 && offer.continuousCapacityRate > 0) {
      sources.push({
        id: offer.id,
        ratePerMinute: state.capacity
          * offer.continuousCapacityRate
          / offer.durationMinutes,
      })
    }
  }
  const activeSources = sources.filter((source) => source.ratePerMinute > 0)
  if (activeSources.length === 0) return

  const totals = activeSources.map((source) => {
    const initialFraction = state.fractionalFansBySource[source.id] ?? 0
    const produced = source.ratePerMinute * elapsedMinutes
    addToRecord(state.theoreticalBySource, source.id, produced)
    return {
      ...source,
      initialFraction,
      total: initialFraction + produced,
    }
  })
  const room = Math.max(0, state.capacity - state.availableFans)
  const totalWholeFans = totals.reduce(
    (sum, source) => sum + Math.floor(source.total + 1e-9),
    0,
  )

  if (totalWholeFans < room) {
    for (const source of totals) {
      const wholeFans = Math.floor(source.total + 1e-9)
      state.fractionalFansBySource[source.id] = source.total - wholeFans
      state.availableFans += wholeFans
      addToRecord(state.recoveredBySource, source.id, wholeFans)
    }
    return
  }

  const acceptedBySource = new Map(totals.map((source) => [source.id, 0]))
  if (room > 0) {
    const totalRate = totals.reduce((sum, source) => sum + source.ratePerMinute, 0)
    const initialFractions = totals.reduce(
      (sum, source) => sum + source.initialFraction,
      0,
    )
    const estimatedFillMinute = Math.max(0, Math.min(
      elapsedMinutes,
      (room - initialFractions) / totalRate,
    ))
    let accepted = 0
    for (const source of totals) {
      const beforeBoundary = Math.max(0, Math.min(
        Math.floor(source.total + 1e-9),
        Math.floor(
          source.initialFraction
          + source.ratePerMinute * estimatedFillMinute
          + 1e-12,
        ),
      ))
      acceptedBySource.set(source.id, beforeBoundary)
      accepted += beforeBoundary
    }
    while (accepted > room) {
      const latestSource = totals.filter(
        (source) => (acceptedBySource.get(source.id) ?? 0) > 0,
      ).toSorted((a, b) => {
        const aCount = acceptedBySource.get(a.id) ?? 0
        const bCount = acceptedBySource.get(b.id) ?? 0
        const aArrival = (aCount - a.initialFraction) / a.ratePerMinute
        const bArrival = (bCount - b.initialFraction) / b.ratePerMinute
        return bArrival - aArrival
      })[0]
      if (!latestSource) break
      acceptedBySource.set(
        latestSource.id,
        (acceptedBySource.get(latestSource.id) ?? 0) - 1,
      )
      accepted -= 1
    }
    while (accepted < room) {
      const nextArrival = Math.min(...totals.map((source) => {
        const acceptedForSource = acceptedBySource.get(source.id) ?? 0
        return (acceptedForSource + 1 - source.initialFraction) / source.ratePerMinute
      }))
      for (const source of totals) {
        if (accepted >= room) break
        const acceptedForSource = acceptedBySource.get(source.id) ?? 0
        const sourceArrival = (
          acceptedForSource + 1 - source.initialFraction
        ) / source.ratePerMinute
        if (Math.abs(sourceArrival - nextArrival) <= 1e-9) {
          acceptedBySource.set(source.id, acceptedForSource + 1)
          accepted += 1
        }
      }
    }
  }

  state.availableFans += room
  for (const source of totals) {
    const accepted = acceptedBySource.get(source.id) ?? 0
    const wasted = Math.max(0, source.total - accepted)
    state.fractionalFansBySource[source.id] = 0
    state.wastedFans += wasted
    addToRecord(state.wastedBySource, source.id, wasted)
    addToRecord(state.recoveredBySource, source.id, accepted)
  }
}

function applyPulsesAt(
  state: EconomyState,
  minute: number,
) {
  const due = state.scheduledPulses.filter((pulse) => pulse.minute === minute)
  for (const pulse of due) {
    applyProducedFans(state, pulse.offerId, state.capacity * pulse.rate)
  }
  state.scheduledPulses = state.scheduledPulses.filter(
    (pulse) => pulse.minute !== minute,
  )
}

function finishAndStartQueued(
  state: EconomyState,
  minute: number,
  supply: SupplyConfig,
) {
  if (!state.activeProgram || state.activeProgram.endMinute !== minute) return
  state.activeProgram = null

  const queued = state.queue.shift()
  if (queued) startProgram(state, findOffer(supply, queued.offerId), minute)
}

export function advanceEconomy(
  state: EconomyState,
  fromMinute: number,
  toMinute: number,
  fans: FanConfig,
  supply: SupplyConfig,
): EconomyState {
  if (toMinute < fromMinute) {
    throw new Error('Economy cannot move backward in time')
  }

  const next = cloneState(state)
  next.capacity = fans.capacity
  next.availableFans = Math.min(next.availableFans, next.capacity)
  let cursor = fromMinute
  let zeroLengthTransitions = 0

  while (cursor < toMinute) {
    const pulseMinute = next.scheduledPulses.find(
      (pulse) => pulse.minute > cursor && pulse.minute <= toMinute,
    )?.minute
    const endMinute = next.activeProgram
      && next.activeProgram.endMinute > cursor
      && next.activeProgram.endMinute <= toMinute
      ? next.activeProgram.endMinute
      : undefined
    const boundary = Math.min(toMinute, pulseMinute ?? toMinute, endMinute ?? toMinute)

    accrueContinuous(next, boundary - cursor, fans, supply)
    cursor = boundary
    applyPulsesAt(next, cursor)
    finishAndStartQueued(next, cursor, supply)

    if (next.activeProgram?.endMinute === cursor) {
      zeroLengthTransitions += 1
      if (zeroLengthTransitions > supply.offers.length + next.queue.length + 1) {
        throw new Error('Recovery queue contains a zero-duration cycle')
      }
      finishAndStartQueued(next, cursor, supply)
    } else {
      zeroLengthTransitions = 0
    }
  }

  if (fromMinute === toMinute) {
    applyPulsesAt(next, toMinute)
    finishAndStartQueued(next, toMinute, supply)
  }

  return next
}

export function aggregateSpend(
  events: SpendEvent[],
  cutoffMinute = Number.POSITIVE_INFINITY,
): { usd: number; diamonds: number; ads: number } {
  return events.reduce(
    (totals, event) => {
      if (event.minute <= cutoffMinute) {
        totals.usd += event.usd
        totals.diamonds += event.diamonds
        totals.ads += event.ads
      }
      return totals
    },
    { usd: 0, diamonds: 0, ads: 0 },
  )
}
