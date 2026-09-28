interface GuildColors {
  main: string
  attack: string
  holding: string
}

const IDENTITY_COLORS: GuildColors[] = [
  { main: '#57A8FF', attack: '#2F7ED7', holding: '#8CC8FF' },
  { main: '#F3C665', attack: '#C79425', holding: '#F8D98F' },
  { main: '#EF7AA8', attack: '#CF4E82', holding: '#F6A7C5' },
  { main: '#7DD7C4', attack: '#43AD98', holding: '#A5E4D7' },
  { main: '#A78BFA', attack: '#7C3AED', holding: '#C4B5FD' },
  { main: '#F59E0B', attack: '#B45309', holding: '#FCD34D' },
  { main: '#22D3EE', attack: '#0891B2', holding: '#67E8F9' },
  { main: '#F97316', attack: '#C2410C', holding: '#FDBA74' },
]

const GUILD_IDENTITIES = new Map([['A', 0], ['B', 1], ['C', 2], ['D', 3]])
const SEMANTIC_COLORS = {
  tier: new Map([
    ['normal', '#7DD7C4'], ['small', '#F3C665'], ['whale', '#EF7AA8'],
  ]),
  offer: new Map([
    ['ad-or-diamond-ad', '#7DD7C4'],
    ['ad-or-diamond-diamond', '#57A8FF'],
    ['flyer', '#F3C665'],
    ['cheer-stick', '#EF7AA8'],
    ['instant-600', '#8CC8FF'],
    ['instant-1000', '#A78BFA'],
    ['instant-2000', '#F59E0B'],
  ]),
}

function fallbackIdentity(id: string): GuildColors {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(id)) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0
  }
  return IDENTITY_COLORS[hash % IDENTITY_COLORS.length]
}

export function resolveGuildColors(guildId: string): GuildColors {
  const index = GUILD_IDENTITIES.get(guildId)
  return { ...(index === undefined ? fallbackIdentity(guildId) : IDENTITY_COLORS[index]) }
}

export function resolveSemanticColor(namespace: 'tier' | 'offer', id: string): string {
  return SEMANTIC_COLORS[namespace].get(id) ?? fallbackIdentity(id).main
}
