/// <reference lib="webworker" />

import { runSensitivity } from '../domain/sensitivity'
import { normalizeFormulaError } from '../domain/formula/types'
import type { WorkerRequest, WorkerResponse } from './protocol'
import { runTrials } from './runner'

const cancelled = new Set<string>()

function post(response: WorkerResponse) {
  self.postMessage(response)
}

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  if (message.type === 'cancel') {
    cancelled.add(message.runId)
    return
  }

  cancelled.delete(message.runId)
  try {
    if (message.type === 'run') {
      const progressStep = Math.max(1, Math.ceil(message.runs / 100))
      const result = await runTrials(
        { scenario: message.scenario, runs: message.runs, seed: message.seed },
        {
          isCancelled: () => cancelled.has(message.runId),
          onProgress: ({ completed, total }) => {
            if (completed % progressStep === 0 || completed === total) {
              post({ type: 'progress', runId: message.runId, completed, total })
            }
          },
        },
      )
      post(result.cancelled
        ? { type: 'cancelled', runId: message.runId }
        : { type: 'result', runId: message.runId, result })
    } else {
      const result = await runSensitivity(message.scenario, message.request, {
        isCancelled: () => cancelled.has(message.runId),
        onPointProgress: (completed, total) => {
          post({ type: 'progress', runId: message.runId, completed, total })
        },
      })
      post(result.cancelled
        ? { type: 'cancelled', runId: message.runId }
        : { type: 'sensitivity-result', runId: message.runId, result })
    }
  } catch (error) {
    const formula = normalizeFormulaError(error, message.type === 'run' ? 'monte-carlo' : 'sensitivity')
    post({
      type: 'error',
      runId: message.runId,
      message: formula?.message ?? '分析失败，请检查参数后重试。',
      ...(formula ? { error: formula } : {}),
    })
  } finally {
    cancelled.delete(message.runId)
  }
})
