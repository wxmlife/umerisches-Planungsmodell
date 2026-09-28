import { act } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerRequest, WorkerResponse } from './worker/protocol'
import App from './App'

class FakeWorker {
  static instances: FakeWorker[] = []
  messages: WorkerRequest[] = []
  listeners: Array<(event: MessageEvent<WorkerResponse>) => void> = []

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(message: WorkerRequest) {
    this.messages.push(message)
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
  ) {
    if (type === 'message' && typeof listener === 'function') {
      this.listeners.push(listener as (event: MessageEvent<WorkerResponse>) => void)
    }
  }

  terminate() {}

  emit(message: WorkerResponse) {
    for (const listener of this.listeners) {
      listener({ data: message } as MessageEvent<WorkerResponse>)
    }
  }
}

describe('App integration', () => {
  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('updates derived recovery numbers, calibration, and stale state from one shared scenario', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByText('83.3 / 小时')).toBeVisible()
    expect(screen.getByText('30 分钟 +1,000')).toBeVisible()

    const capacity = screen.getByLabelText('粉丝池上限')
    await user.clear(capacity)
    await user.type(capacity, '50')
    expect(screen.getByTestId('result-grid')).toHaveAttribute('data-stale', 'true')

    await user.clear(capacity)
    await user.type(capacity, '4000')

    expect(await screen.findByText('166.7 / 小时')).toBeVisible()
    expect(screen.getByText('30 分钟 +2,000')).toBeVisible()
    expect(screen.getByLabelText('每人同时编队数')).toHaveValue(999)
  })

  it('wires all eight result regions and exposes worker progress and cancellation', async () => {
    const user = userEvent.setup()
    render(<App />)
    for (const heading of [
      '连续挑战曲线',
      '6 日积分曲线',
      '每日积分来源',
      '节点与粉丝曲线',
      '最终排名',
      '补给与效率曲线',
      '累计消费仪表盘',
      '参数敏感性曲线',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeVisible()
    }

    await user.click(screen.getByRole('button', { name: '运行蒙特卡洛' }))
    const worker = FakeWorker.instances[0]
    const runMessage = worker.messages.find((message) => message.type === 'run')
    expect(runMessage?.type).toBe('run')
    if (!runMessage) throw new Error('Expected a run request')
    await act(async () => {
      worker.emit({
        type: 'progress',
        runId: runMessage.runId,
        completed: 125,
        total: 1000,
      })
    })
    expect(screen.getByText('已完成 125 / 1000')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '取消运行' }))
    expect(screen.getByRole('button', { name: '正在取消' })).toBeDisabled()
  })

  it('sends the selected sensitivity parameter and metric to the worker', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.selectOptions(screen.getByLabelText('扫描参数'), 'battle.alpha')
    await user.selectOptions(
      screen.getByLabelText('结果指标'),
      'battleThreeWinProbability',
    )
    await user.click(screen.getByRole('button', { name: '运行敏感性分析' }))

    const worker = FakeWorker.instances[0]
    const request = worker.messages.find((message) => message.type === 'sensitivity')
    expect(request?.type).toBe('sensitivity')
    if (!request || request.type !== 'sensitivity') {
      throw new Error('Expected a sensitivity request')
    }
    expect(request.request.parameter).toBe('battle.alpha')
    expect(request.request.metric).toBe('battleThreeWinProbability')
  })
})
