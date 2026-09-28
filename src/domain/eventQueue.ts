export interface ScheduledEvent {
  minute: number
  priority: number
}

interface HeapEntry<T> {
  event: T
  sequence: number
}

export class EventQueue<T extends ScheduledEvent> {
  private heap: Array<HeapEntry<T>> = []
  private nextSequence = 0

  get size(): number {
    return this.heap.length
  }

  push(event: T): void {
    const entry = { event, sequence: this.nextSequence }
    this.nextSequence += 1
    this.heap.push(entry)
    this.bubbleUp(this.heap.length - 1)
  }

  peek(): T | undefined {
    return this.heap[0]?.event
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined
    const first = this.heap[0]
    const last = this.heap.pop()!
    if (this.heap.length > 0) {
      this.heap[0] = last
      this.bubbleDown(0)
    }
    return first.event
  }

  private precedes(a: HeapEntry<T>, b: HeapEntry<T>): boolean {
    if (a.event.minute !== b.event.minute) return a.event.minute < b.event.minute
    if (a.event.priority !== b.event.priority) return a.event.priority < b.event.priority
    return a.sequence < b.sequence
  }

  private bubbleUp(startIndex: number) {
    let index = startIndex
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (this.precedes(this.heap[parent], this.heap[index])) break
      ;[this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]]
      index = parent
    }
  }

  private bubbleDown(startIndex: number) {
    let index = startIndex
    while (true) {
      const left = index * 2 + 1
      const right = left + 1
      let smallest = index
      if (left < this.heap.length && this.precedes(this.heap[left], this.heap[smallest])) {
        smallest = left
      }
      if (right < this.heap.length && this.precedes(this.heap[right], this.heap[smallest])) {
        smallest = right
      }
      if (smallest === index) return
      ;[this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]]
      index = smallest
    }
  }
}
