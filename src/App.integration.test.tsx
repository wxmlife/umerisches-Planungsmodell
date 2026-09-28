import { act } from 'react'
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
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
    localStorage.clear()
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
  })

  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it('debounces formula validation for 300 ms while controls stay interactive and results keep applied data', async () => {
    vi.useFakeTimers()
    const { container } = render(<App />)
    fireEvent.click(screen.getByText('编辑战斗公式'))
    const editor = screen.getByRole('textbox', { name: 'preRandomPower 公式' })
    const before = screen.getByRole('table', { name: '1,000 vs 1,000' }).textContent
    fireEvent.change(editor, { target: { value: 'idolPower +' } })
    expect(editor).toHaveValue('idolPower +')
    expect(editor.closest('[aria-busy="true"]')).toBeNull()
    expect(editor.closest('[data-stale="true"]')).toBeNull()
    for (const control of container.querySelectorAll('input, textarea, select')) expect(control.closest('[data-stale="true"]')).toBeNull()
    expect(screen.getByTestId('result-grid')).not.toHaveAttribute('aria-busy')
    expect(screen.getByText(/当前公式未应用/)).toBeVisible()
    await act(async () => { vi.advanceTimersByTime(299) })
    expect(screen.queryByText(/公式包含意外或不支持/)).toBeNull()
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(screen.getByText(/公式包含意外或不支持/)).toBeVisible()
    expect(screen.getByRole('table', { name: '1,000 vs 1,000' }).textContent).toBe(before)
    expect(container.querySelector('input[type="range"]')).toBeNull()
    const ids = [...container.querySelectorAll('[id]')].map(el => el.id).filter(Boolean)
    expect(new Set(ids).size).toBe(ids.length)
    for (const label of container.querySelectorAll('label[for]')) expect(ids.filter(id => id === label.getAttribute('for'))).toHaveLength(1)
  })

  it('synchronizes battle inputs in both directions and keeps results on applied until success', async () => {
    const { container } = render(<App />)
    const sidebar = screen.getByRole('complementary', { name: '模拟参数' })
    const battle = screen.getByRole('region', { name: '连续挑战曲线' })
    const side = within(sidebar).getByLabelText('小 R 战力倍率')
    const quick = within(battle).getByLabelText('小 R 战力倍率')
    fireEvent.change(side, { target: { value: '4' } })
    expect(quick).toHaveValue(4)
    fireEvent.change(quick, { target: { value: '5' } })
    expect(side).toHaveValue(5)
    await waitFor(() => expect(screen.getByText(/小 R ×5.*大 R ×9/)).toBeVisible())
    expect(container.querySelector('input[type="range"]')).toBeNull()
    expect(quick).toHaveAttribute('step', '0.1')
    expect(quick).toHaveAccessibleDescription(/0.1.*20.*0.1/)
  })

  it('provides inspect, copy and clear recovery actions and confirmed reset', async () => {
    localStorage.setItem('alliance-war-simulator/scenario/v3', '{broken')
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByText('查看恢复数据'))
    expect(screen.getByLabelText('恢复数据 JSON')).toHaveValue('{broken')
    await user.click(screen.getByRole('button', { name: '复制 JSON' }))
    expect(await navigator.clipboard.readText()).toBe('{broken')
    await user.click(screen.getByRole('button', { name: '清除备份' }))
    expect(localStorage.getItem('alliance-war-simulator/recovery/latest')).toBeNull()
    await user.click(screen.getByRole('button', { name: '恢复默认方案' }))
    expect(screen.getByRole('dialog')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '确认恢复默认' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(localStorage.getItem('alliance-war-simulator/scenario/v3')).toBeNull()
  })

  it('places the season score card first and battle calibration immediately after it', () => {
    render(<App />)
    const cards = screen.getByTestId('result-grid').children
    expect(within(cards[0] as HTMLElement).getByRole('heading', { name: '6 日积分曲线' })).toBeVisible()
    expect(within(cards[1] as HTMLElement).getByRole('heading', { name: '连续挑战曲线' })).toBeVisible()
    for (const title of ['最终排名', '补给与效率曲线']) {
      const gridItem = [...cards].find(card => within(card as HTMLElement).queryByRole('heading', { name: title }))
      expect(gridItem).toHaveClass('dashboard-card--wide')
    }
  })

  it('wires deterministic spend catalogs and per-guild purchasing policy edits', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByText('确定性基准消费')).toBeVisible()
    const table = screen.getByRole('table', { name: '消费账本汇总' })
    expect(within(table).getAllByRole('row')).toHaveLength(6)
    await user.click(screen.getByText('公会消费策略'))
    await user.selectOptions(screen.getByLabelText('消费策略公会'), 'B')
    await user.click(screen.getByRole('tab', { name: '小 R' }))
    await user.clear(screen.getByLabelText('单人版本美元预算'))
    await user.type(screen.getByLabelText('单人版本美元预算'), '36')
    await waitFor(() => expect(screen.getByRole('button', { name: '运行蒙特卡洛' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '运行蒙特卡洛' }))
    const request = FakeWorker.instances[0].messages.find(message => message.type === 'run')
    expect(request?.scenario.guilds[1].purchasePolicies.small.versionUsdBudget).toBe(36)
    expect(request?.scenario.guilds[0].purchasePolicies.small.versionUsdBudget).toBe(24)
  })

  it.each([1, 6, 14])('uses the configured %i day count in the season score title and accessible chart label', async (days) => {
    const user = userEvent.setup()
    render(<App />)
    await user.clear(screen.getByLabelText('中心开放日'))
    await user.type(screen.getByLabelText('中心开放日'), '1')
    await user.clear(screen.getByLabelText('赛季战斗日'))
    await user.type(screen.getByLabelText('赛季战斗日'), String(days))
    expect(await screen.findByRole('heading', { name: `${days} 日积分曲线` })).toBeVisible()
    expect(screen.getByRole('img', { name: `公会的 ${days} 日累计积分` })).toBeInTheDocument()
    expect(screen.queryByText('SIX-DAY SCORE')).not.toBeInTheDocument()
  })

  it.each([
    ['A', '#57A8FF'], ['B', '#F3C665'], ['C', '#EF7AA8'], ['D', '#7DD7C4'],
  ])('colors both target-guild labels with the main identity color of %s', async (id, color) => {
    const user = userEvent.setup()
    render(<App />)
    await user.selectOptions(screen.getByLabelText('目标公会'), id)
    for (const title of ['节点与粉丝曲线', '补给与效率曲线']) {
      const card = screen.getByRole('heading', { name: title }).closest('section')!
      expect(within(card).getByText(id, { selector: '.card-header span' })).toHaveStyle({ color })
    }
  })

  it('updates derived recovery numbers, calibration, and stale state from one shared scenario', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByText('83.3 / 小时')).toBeVisible()
    expect(screen.getByText('30 分钟 +1,000')).toBeVisible()

    const capacity = screen.getByLabelText('粉丝池上限')
    await user.clear(capacity)
    await user.type(capacity, '50')
    expect(screen.getByTestId('season-results')).toHaveAttribute('data-stale', 'true')

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
