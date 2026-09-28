import { describe, expect, it } from 'vitest'
import { EventQueue } from '../eventQueue'

describe('EventQueue', () => {
  it('orders equal-minute events by priority and then insertion sequence', () => {
    const queue = new EventQueue<{ minute: number; priority: number; label: string }>()
    queue.push({ minute: 60, priority: 30, label: 'snapshot' })
    queue.push({ minute: 60, priority: 20, label: 'action-1' })
    queue.push({ minute: 60, priority: 20, label: 'action-2' })
    queue.push({ minute: 60, priority: 10, label: 'unlock' })
    queue.push({ minute: 30, priority: 30, label: 'earlier' })

    const labels: string[] = []
    while (queue.size > 0) labels.push(queue.pop()!.label)

    expect(labels).toEqual(['earlier', 'unlock', 'action-1', 'action-2', 'snapshot'])
  })

  it('returns undefined when empty', () => {
    const queue = new EventQueue<{ minute: number; priority: number }>()
    expect(queue.pop()).toBeUndefined()
    expect(queue.peek()).toBeUndefined()
  })
})
