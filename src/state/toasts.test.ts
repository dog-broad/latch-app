import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { pushToast, dismissToast, getToasts } from './toasts'

beforeEach(() => {
  // the store is a module singleton; drain anything a prior test left.
  for (const t of getToasts()) dismissToast(t.id)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('toast store', () => {
  it('push grows the queue and returns a unique id', () => {
    const a = pushToast('success', 'sent')
    const b = pushToast('error', 'nope')
    expect(getToasts().map((t) => t.id)).toEqual([a, b])
    expect(a).not.toBe(b)
    expect(getToasts()[0]?.message).toBe('sent')
    expect(getToasts()[1]?.kind).toBe('error')
  })

  it('auto-dismisses after the duration', () => {
    pushToast('success', 'sent', 1000)
    expect(getToasts()).toHaveLength(1)
    vi.advanceTimersByTime(999)
    expect(getToasts()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(getToasts()).toHaveLength(0)
  })

  it('does not auto-dismiss when duration is 0', () => {
    pushToast('info', 'sticky', 0)
    vi.advanceTimersByTime(100_000)
    expect(getToasts()).toHaveLength(1)
  })

  it('manual dismiss removes the right toast and clears its timer', () => {
    const a = pushToast('success', 'a', 1000)
    const b = pushToast('success', 'b', 1000)
    dismissToast(a)
    expect(getToasts().map((t) => t.message)).toEqual(['b'])
    // advancing past a's original duration must not throw or double-remove
    vi.advanceTimersByTime(1000)
    expect(getToasts()).toHaveLength(0)
    void b
  })

  it('dismissing an unknown id is a no-op', () => {
    pushToast('info', 'x', 0)
    dismissToast(999999)
    expect(getToasts()).toHaveLength(1)
  })

  it('caps the queue at 4, evicting the oldest', () => {
    pushToast('info', '1', 0)
    pushToast('info', '2', 0)
    pushToast('info', '3', 0)
    pushToast('info', '4', 0)
    pushToast('info', '5', 0)
    expect(getToasts()).toHaveLength(4)
    expect(getToasts().map((t) => t.message)).toEqual(['2', '3', '4', '5'])
  })
})
