import type { MonteCarloResult } from '../domain/aggregate'
import type { SensitivityRequest, SensitivityResult } from '../domain/sensitivity'
import type { Scenario } from '../domain/types'

export type WorkerRequest =
  | { type: 'run'; runId: string; scenario: Scenario; runs: number; seed: number }
  | { type: 'sensitivity'; runId: string; scenario: Scenario; request: SensitivityRequest }
  | { type: 'cancel'; runId: string }

export type WorkerResponse =
  | { type: 'progress'; runId: string; completed: number; total: number }
  | { type: 'result'; runId: string; result: MonteCarloResult }
  | { type: 'sensitivity-result'; runId: string; result: SensitivityResult }
  | { type: 'cancelled'; runId: string }
  | { type: 'error'; runId: string; message: string }
