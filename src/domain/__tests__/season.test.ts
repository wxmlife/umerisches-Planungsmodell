import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO } from '../defaults'
import { createSeededRng } from '../rng'
import { runSeason } from '../season'

describe('six-day season engine', () => {
  it('lets the default 999 formation slots behave as effectively unbounded', () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    scenario.season.nodeCounts = { normal: 3, core: 0, center: 0 }
    scenario.guilds = [scenario.guilds[0]]
    const result = runSeason(scenario, createSeededRng(1), 'deterministic')
    expect(result.guilds.A.maxSimultaneousGarrisons).toBe(3)
  })

  it('honors a manually reduced one-slot formation limit', () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    scenario.fans.formationSlots = 1
    scenario.season.nodeCounts = { normal: 3, core: 0, center: 0 }
    scenario.guilds = [scenario.guilds[0]]
    const result = runSeason(scenario, createSeededRng(1), 'deterministic')
    expect(result.guilds.A.maxGarrisonsPerPlayer).toBe(1)
  })

  it('does not award battle score for neutral deployment or defender success', () => {
    const result = runSeason(DEFAULT_SCENARIO, createSeededRng(2), 'deterministic')
    for (const guild of Object.values(result.guilds)) {
      expect(guild.totalScore).toBeCloseTo(guild.attackScore + guild.holdingScore, 8)
      expect(guild.defenderGuildScore).toBe(0)
    }
  })

  it('settles holding score by elapsed time and opens center only on day six', () => {
    const result = runSeason(DEFAULT_SCENARIO, createSeededRng(3), 'deterministic')
    expect(result.events.find((event) => event.nodeKind === 'center')?.minute)
      .toBeGreaterThanOrEqual(5 * 1440)
    expect(result.invariants.holdingScoreReconciled).toBe(true)
    for (const guildId of Object.keys(result.guilds)) {
      const scores = result.snapshots
        .filter((snapshot) => snapshot.guildId === guildId)
        .map((snapshot) => snapshot.totalScore)
      expect(scores.every((score, index) => index === 0 || score >= scores[index - 1])).toBe(true)
    }
  })

  it('terminates cleanly when nobody has fans or a valid target', () => {
    const scenario = structuredClone(DEFAULT_SCENARIO)
    scenario.fans.naturalCapacityPerDay = 0
    scenario.guilds.forEach((guild) => {
      guild.deployFans = { normal: 2000, core: 2000, center: 2000 }
    })
    const result = runSeason(scenario, createSeededRng(4), 'deterministic')
    expect(result.eventCount).toBeLessThan(
      scenario.simulation.maxEventsPerDay * scenario.season.days,
    )
    expect(result.termination).toBe('season-end')
  })

  it('keeps node ownership and fan balances valid throughout a season', () => {
    const result = runSeason(DEFAULT_SCENARIO, createSeededRng(5), 'stochastic')
    expect(result.invariants).toMatchObject({
      singleOwnerPerNode: true,
      nonnegativeFans: true,
      holdingScoreReconciled: true,
    })
    expect(result.snapshots.at(-1)?.minute).toBe(DEFAULT_SCENARIO.season.days * 1440)
  })
})
