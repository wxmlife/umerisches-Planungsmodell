# Integrated Alliance Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the confirmed dashboard hierarchy, guild identity colors, per-guild consumption, editable battle formulas, durable local scenarios, and the new six-day reward model into the existing React simulator.

**Architecture:** Keep deterministic domain logic in `src/domain`, chart projection in `src/charts`, UI in `src/components`, and orchestration/persistence in `src/state`. Extend `Scenario` as the single editable source of truth; compile formulas into non-serialized runtimes per simulation; derive reward issuance from the deterministic season event ledger and the season-start roster.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 5, Testing Library, ECharts 6.

**Specs:**
- `docs/superpowers/specs/2026-09-28-dashboard-consumption-formula-design.md`
- `docs/superpowers/specs/2026-09-28-alliance-reward-audit-and-model.md`

## Global Constraints

- Use test-driven development: every production behavior starts with a test that is observed failing for the intended reason.
- Do not add `eval`, `new Function`, arbitrary JavaScript execution, or a generic scripting dependency.
- Store formula RHS strings only; parser limits are 512 source characters, 128 AST nodes, and depth 24.
- Guild A/B/C/D main colors are `#57A8FF/#F3C665/#EF7AA8/#7DD7C4`; battle and holding use the exact dark/light variants from the dashboard spec.
- Unknown guild and product identities use deterministic unsigned FNV-1a fallback colors, never object order.
- Consumption policies live only at `scenario.guilds[*].purchasePolicies`; product definitions and `adDailyLimit` remain global.
- Default per-player six-day budgets are normal `0 USD / 120 diamonds / 12 ads`, small R `24 USD`, whale `90 USD`, with the exact priority arrays from the spec.
- The consumption chart is explicitly a deterministic baseline and never presents one deterministic ledger as Monte Carlo output.
- Formula changes must affect challenge calibration, target utility, deterministic battles, Monte Carlo, and sensitivity through one domain runtime.
- Persistent storage is local-only and uses the v3 envelope and recovery behavior from the dashboard spec.
- The new free reward model replaces the legacy free WarPass by default; paid pass, lifetime red pockets, shop exchanges, and IAP all-member gifts remain separate.
- Reward item IDs follow the supplied `GameItemType`: diamond `2`, company ticket `5`, merit `90`, contribution `91`, energy drink `92`, progress point `94`, chat title `601`.
- Competitive currencies and recovery rewards are settlement-time outputs and cannot feed back into the same simulated season.
- Do not edit any source `.xls` workbook.

## Review Focus

- A scenario containing six or more guilds in different orders must retain stable, distinct-enough identity colors and complete spend rows.
- A mixed-cost offer at a day boundary must be all-or-nothing across cash, diamonds, ads, daily limits, and unlocked version budgets.
- Formula inputs near zero, `1e15`, division overflow, invalid function domains, and conditional short-circuiting must return the specified value or structured error without crashing a Worker.
- Corrupt, future-version, structurally partial, or runtime-invalid local storage must recover without a blank page and must retain recoverable text.
- Reward results with zero participation, tied guild scores, incomplete guild milestones, and a roster larger than the active set must not double-award or let one high spender replace inactive members.

---

### Task 1: Dashboard hierarchy and stable semantic colors

**Files:**
- Create: `src/charts/colors.ts`
- Create: `src/charts/__tests__/colors.test.ts`
- Modify: `src/charts/options.ts`
- Modify: `src/charts/__tests__/options.test.ts`
- Modify: `src/components/SeasonScorePanel.tsx`
- Modify: `src/components/DailyBreakdownPanel.tsx`
- Modify: `src/components/NodeFanPanel.tsx`
- Modify: `src/components/SupplyEfficiencyPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.integration.test.tsx`

**Interfaces:**
- Produces: `resolveGuildColors(guildId: string): { main: string; attack: string; holding: string }`.
- Produces: `resolveSemanticColor(namespace: 'tier' | 'offer', id: string): string`.
- Produces: dynamic season score title `${seasonDays} 日积分曲线` and first-card placement.

- [ ] **Step 1: Write failing chart and integration tests** for exact A–D colors, unknown-ID stability under reordering, explicit deterministic/MC/daily series colors, target guild label colors, dynamic 1/6/14-day titles, and score-card-first ordering.
- [ ] **Step 2: Run** `npm test -- src/charts/__tests__/colors.test.ts src/charts/__tests__/options.test.ts src/App.integration.test.tsx` and confirm failures name missing color resolution/order/title behavior.
- [ ] **Step 3: Implement the shared color resolver and apply it to every chart/label path; reorder App cards and make the title dynamic.**
- [ ] **Step 4: Run the focused tests, then `npm test`; both must pass.**
- [ ] **Step 5: Commit** with message `feat: unify guild colors and result hierarchy`.

### Task 2: Per-guild version budgets and sensitivity semantics

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/defaults.ts`
- Modify: `src/domain/validation.ts`
- Modify: `src/domain/season.ts`
- Modify: `src/domain/aggregate.ts`
- Modify: `src/domain/__tests__/aggregate.test.ts`
- Modify: `src/worker/runner.ts`
- Modify: `src/worker/protocol.ts`
- Modify: `src/domain/sensitivity.ts`
- Modify: `src/domain/__tests__/validation.test.ts`
- Modify: `src/domain/__tests__/economy.test.ts`
- Modify: `src/domain/__tests__/season.test.ts`
- Modify: `src/domain/__tests__/sensitivity.test.ts`
- Modify: `src/test/fixtures.ts`

**Interfaces:**
- Produces: `GuildConfig.purchasePolicies: Record<Tier, TierPurchasePolicy>`.
- Produces: `TierPurchasePolicy` with `versionUsdBudget`, `versionDiamondBudget`, `versionAdBudget`, `useAds`, `supplyPriority`.
- Produces: sensitivity parameter ID `supply.versionUsdBudget`, localized by `targetGuildId + targetTier`.
- Consumes: existing `SpendEvent` ledger and daily product limits.

- [ ] **Step 1: Write failing domain tests** for default policies, integer budget validation, exact day-1/day-2/final unlock boundaries, rollover, multi-currency all-or-nothing purchase, ads requiring all four gates, independent guild overrides, and localized sensitivity scans.
- [ ] **Step 2: Run** `npm test -- src/domain/__tests__/validation.test.ts src/domain/__tests__/economy.test.ts src/domain/__tests__/season.test.ts src/domain/__tests__/sensitivity.test.ts` and confirm failures are caused by the old global daily policy.
- [ ] **Step 3: Move policies into each guild, add version-spend counters and unlock helpers, update purchase eligibility and sensitivity mutation, and migrate all in-repo fixtures.**
- [ ] **Step 4: Run focused tests and `npm test`; both must pass.**
- [ ] **Step 5: Commit** with message `feat: add per-guild version consumption policies`.

### Task 3: Consumption editor and deterministic spend dashboard

**Files:**
- Modify: `src/charts/cumulativeSpend.ts`
- Modify: `src/charts/options.ts`
- Modify: `src/charts/__tests__/options.test.ts`
- Modify: `src/components/CumulativeSpendPanel.tsx`
- Modify: `src/components/ParameterSidebar.tsx`
- Modify: `src/components/SensitivityPanel.tsx`
- Modify: `src/components/SupplyEfficiencyPanel.tsx`
- Modify: `src/components/__tests__/CumulativeSpendPanel.test.tsx`
- Modify: `src/components/__tests__/ParameterSidebar.test.tsx`
- Modify: `src/components/__tests__/SupplyEfficiencyPanel.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.integration.test.tsx`

**Interfaces:**
- Produces: `CumulativeSpendViewInput { events, groupCatalog, endMinute, metric, dimension, colorResolver }`.
- Produces: `buildCumulativeSpendSeries(input)` with complete zero-value group rows and a `0..endMinute` timeline.
- Consumes: Task 1 color resolvers and Task 2 guild purchase policy paths.

- [ ] **Step 1: Write failing component/chart tests** for zero-event catalogs, partial-guild events, complete tier/product rows, exact season endpoint, one selected currency, correct units/colors/tooltips, summary-table ledger reconciliation, and “确定性基准消费” copy.
- [ ] **Step 2: Write failing sidebar tests** for guild selector → tier editor isolation, exact version labels/defaults/priorities, integer steps, and sensitivity `$·人⁻¹·版本⁻¹` labels with no daily-budget text.
- [ ] **Step 3: Run** the three focused component test files plus `src/charts/__tests__/options.test.ts`; confirm expected failures.
- [ ] **Step 4: Implement the new spend view contract, metric selector, summary table, empty state, per-guild policy editor, and updated sensitivity labels.**
- [ ] **Step 5: Run focused tests and `npm test`; both must pass.**
- [ ] **Step 6: Commit** with message `feat: expose guild spending strategies and totals`.

### Task 4: Safe battle formula language

**Files:**
- Create: `src/domain/formula/types.ts`
- Create: `src/domain/formula/parser.ts`
- Create: `src/domain/formula/compiler.ts`
- Create: `src/domain/formula/runtime.ts`
- Create: `src/domain/formula/__tests__/parser.test.ts`
- Create: `src/domain/formula/__tests__/runtime.test.ts`

**Interfaces:**
- Produces: `FormulaId`, `FormulaErrorDto`, `CompiledFormula`, `BattleFormulaConfig`.
- Produces: `compileFormula(formulaId: FormulaId, source: string): CompiledFormula`.
- Produces: `evaluateFormula(program: CompiledFormula, variables: Record<string, number | boolean>): number`.
- Produces: parser/program caches keyed exactly as required by the spec.

- [ ] **Step 1: Write failing parser tests** for the complete EBNF precedence/associativity, scientific numbers, typed booleans/ternaries, identifier/function whitelists, arity, assignment/member/string/array rejection, and source/node/depth limits.
- [ ] **Step 2: Run parser tests and confirm the missing module failure.**
- [ ] **Step 3: Implement tokenization, recursive-descent parsing, static typing, formula-specific schemas, and structured parse/type errors.**
- [ ] **Step 4: Write failing runtime tests** for short-circuiting, divide/modulo zero, domains, non-finite output, range contracts, `uniformWinProbability`, and cache isolation across formula IDs.
- [ ] **Step 5: Run runtime tests and confirm expected runtime/contract failures.**
- [ ] **Step 6: Implement the evaluator, domain function, output validation, and bounded caches.**
- [ ] **Step 7: Run all formula tests and `npm test`; both must pass.**
- [ ] **Step 8: Commit** with message `feat: add safe battle formula runtime`.

### Task 5: Formula-driven combat and all analysis paths

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/defaults.ts`
- Modify: `src/domain/battle.ts`
- Modify: `src/domain/season.ts`
- Modify: `src/domain/sensitivity.ts`
- Modify: `src/domain/__tests__/battle.test.ts`
- Modify: `src/domain/__tests__/season.test.ts`
- Modify: `src/domain/__tests__/sensitivity.test.ts`
- Modify: `src/domain/aggregate.ts`
- Modify: `src/worker/protocol.ts`
- Modify: `src/worker/runner.ts`
- Modify: `src/worker/monteCarlo.worker.ts`
- Modify: `src/worker/__tests__/runner.test.ts`

**Interfaces:**
- Consumes: Task 4 compiler/runtime.
- Produces: `scenario.battle.formulas` with the four exact default RHS strings.
- Produces: one compiled battle runtime reused by challenge series, target selection, battle resolution, Monte Carlo, and sensitivity.
- Produces: structured-clone-safe `FormulaErrorDto` Worker failures.

- [ ] **Step 1: Write failing battle tests** proving default challenge values match the legacy implementation, zero-fan/`beta=0` protection, finite saturated power ratios, expected challenge loss for win-dependent formulas, custom probability sampling, and explicit fan-loss capping/errors.
- [ ] **Step 2: Write failing season/Worker tests** proving constant probabilities alter target utility/selection and outcomes, one compile per formula/runtime, and structured Worker errors.
- [ ] **Step 3: Run focused battle, season, sensitivity, and Worker tests; confirm failures use the old hard-coded paths.**
- [ ] **Step 4: Integrate the formula runtime into every domain path and remove duplicate hard-coded calculations while preserving exported compatibility helpers where tests/API still require them.**
- [ ] **Step 5: Add the 50,000-sample analytic probability regression and establish the new fixed-seed season baseline.**
- [ ] **Step 6: Run focused tests and `npm test`; both must pass.**
- [ ] **Step 7: Commit** with message `feat: drive combat and analysis from editable formulas`.

### Task 6: Draft/pending/applied state, formula editor, and local recovery

**Files:**
- Create: `src/state/persistence.ts`
- Create: `src/state/__tests__/persistence.test.ts`
- Create: `src/components/BattleFormulaEditor.tsx`
- Create: `src/components/__tests__/BattleFormulaEditor.test.tsx`
- Modify: `src/state/simulatorReducer.ts`
- Modify: `src/state/useSimulator.ts`
- Modify: `src/state/__tests__/simulatorReducer.test.ts`
- Modify: `src/components/BattleCalibrationPanel.tsx`
- Modify: `src/components/ParameterSidebar.tsx`
- Modify: `src/components/NumberSlider.tsx`
- Modify: `src/components/__tests__/BattleCalibrationPanel.test.tsx`
- Modify: `src/components/__tests__/ParameterSidebar.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.integration.test.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Produces: reducer state `draftScenario`, `pendingScenario`, `appliedScenario`, `revision` and atomic apply/failure actions.
- Produces: `loadPersistedSimulatorState(storage): LoadResult`, `savePersistedSimulatorState(storage, envelope)`, `resetPersistedSimulatorState(storage)`.
- Produces: v3 storage/recovery keys exactly from the spec.
- Consumes: Task 4 structured formula errors and Task 5 formula-backed deterministic run.

- [ ] **Step 1: Write failing reducer tests** for revision races, deterministic-run failure preserving applied, analysis failure not rolling back applied, and per-formula restore actions.
- [ ] **Step 2: Write failing persistence tests** for valid v3, legacy policy/budget/analysis migration, invalid formula draft retention, corrupt/future/partial payload recovery, runtime-invalid applied fallback, and reset clearing both keys.
- [ ] **Step 3: Write failing editor/integration tests** for 300 ms formula debounce, draft/applied split, side-panel bidirectional controls, unique DOM IDs/labels, stale styling scope, formula tabs/status/errors, and restore buttons.
- [ ] **Step 4: Run focused state/component tests and confirm the old two-state reducer and missing storage/editor cause the failures.**
- [ ] **Step 5: Implement persistence decoding/migration/recovery, three-stage state transitions, formula editor wiring, unique control prefixes, and result-only stale/`aria-busy` styling.**
- [ ] **Step 6: Run focused tests and `npm test`; both must pass.**
- [ ] **Step 7: Commit** with message `feat: persist editable formula scenarios safely`.

### Task 7: Six-day reward model domain

**Files:**
- Create: `src/domain/rewards.ts`
- Create: `src/domain/__tests__/rewards.test.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/domain/defaults.ts`
- Modify: `src/domain/validation.ts`
- Modify: `src/domain/__tests__/validation.test.ts`
- Modify: `src/domain/season.ts`
- Modify: `src/domain/aggregate.ts`
- Modify: `src/worker/protocol.ts`
- Modify: `src/worker/runner.ts`
- Modify: `src/worker/__tests__/runner.test.ts`
- Modify: `src/state/persistence.ts`
- Modify: `src/state/__tests__/persistence.test.ts`

**Interfaces:**
- Produces: `RewardItem`, `RewardConfig`, `RewardPlayerResult`, `GuildRewardResult`, `RewardModelResult`.
- Produces: `calculateRewardModel(scenario: Scenario, season: SeasonResult): RewardModelResult`.
- Produces: `aggregateRewardModels(results: RewardModelResult[])` with P10/P50/P90 completion, eligibility, and per-resource issuance metrics for Monte Carlo output.
- Produces: `LegacyRewardAuditInput`, `LegacyRewardAuditResult`, and `calculateLegacyRewardAudit(input)` with separate free-pass, paid-pass, lifetime-red-pocket, shop-exchange, and IAP-all-member sources.
- Produces: default 12 personal stages, four per-capita guild milestones, rank merit `20/15/10/5`, eligibility, daily `22,000` cap, and legacy comparison totals.
- Consumes: season-start roster and battle events; never mutates season combat/economy state.

- [ ] **Step 1: Write failing tests** for every exact personal reward stage/aggregate, old 664,000 audit versus new 110,000 target, point awards by node/outcome, daily cap, zero/inactive players, per-capita guild progress, eligibility thresholds, deterministic tie ranking, title metadata, and no same-season feedback. Equal-score guilds share the occupied rank slots and each receives the arithmetic mean of those slots' merit, rounded half-up to an integer.
- [ ] **Step 2: Add a failing 52-member issuance test** where C/A/B/D rank 1–4 and totals equal `12,480 diamonds / 13,205 merit / 5,200 contribution / 5,720 tickets` when everyone qualifies.
- [ ] **Step 3: Add failing legacy-source tests** for the exact old free/paid WarPass totals, red-pocket `5,480` per-player theoretical and `102,400` all-seat lifetime cap, finite shop `137,700` merit inventory plus separately labeled unlimited exchanges, and IAP issuance as per-member reward × purchase count × effective member count. Different resource IDs must remain separate; no synthetic total-value number is allowed without explicit rates.
- [ ] **Step 4: Add failing aggregation/Worker tests** for P10/P50/P90 reward completion, eligibility counts, and per-resource issuance across stochastic runs; assert the deterministic reward result and Monte Carlo reward distribution are labeled separately.
- [ ] **Step 5: Run reward/validation/aggregate/Worker tests and confirm failures are caused by the missing reward domain/config.**
- [ ] **Step 6: Implement validated reward configuration, roster reconstruction, capped per-player progress, guild/rank settlement, resource aggregation, Monte Carlo reward quantiles, legacy-delta calculation, parameterized legacy-source audit, and v3 persistence decoding/default migration for `scenario.rewards`.**
- [ ] **Step 7: Run focused tests and `npm test`; both must pass.**
- [ ] **Step 8: Commit** with message `feat: add six-day guild reward model`.

### Task 8: Reward dashboard and integrated responsive workbench

**Files:**
- Create: `src/components/RewardDashboardPanel.tsx`
- Create: `src/components/__tests__/RewardDashboardPanel.test.tsx`
- Modify: `src/components/ParameterSidebar.tsx`
- Modify: `src/components/__tests__/ParameterSidebar.test.tsx`
- Modify: `src/charts/options.ts`
- Modify: `src/charts/__tests__/options.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.integration.test.tsx`
- Modify: `src/styles/app.css`
- Modify: `src/styles/tokens.css`

**Interfaces:**
- Consumes: Task 7 `calculateRewardModel` and editable `scenario.rewards`.
- Produces: reward summary cards, guild/tier/player table, per-resource issuance chart, 12-stage and four-milestone preview, deterministic reward settlement plus separately labeled Monte Carlo P10/P50/P90 reward distributions, legacy comparison, separate source audit for paid pass/red pockets/shop/IAP gifts, settlement/eligibility explanations, and editable reward inputs.

- [ ] **Step 1: Write failing panel tests** for exact default totals, zero participation, dimension switching, complete zero rows, resource-unit separation, replacement-mode labeling, paid-pass completer/red-pocket claim/IAP purchase inputs, shop exchange shown as a sink rather than free issuance, warning cards for legacy 664,000 / red-pocket mismatch / SR–SSR inversion, and chat-title `601` display.
- [ ] **Step 2: Write failing App/sidebar tests** for reward panel placement after core season results, editable target/daily cap/point coefficients/milestones/ranks, synchronized scenario updates, and preservation across the Task 6 persistence path.
- [ ] **Step 3: Run focused panel/App/sidebar/chart tests and confirm expected missing-UI failures.**
- [ ] **Step 4: Implement the reward dashboard, controls, issuance chart, explanatory audit section, and responsive desktop/single-column/narrow layouts.**
- [ ] **Step 5: Run focused tests and `npm test`; both must pass.**
- [ ] **Step 6: Run** `npm run lint` and `npm run build`; both must exit 0.
- [ ] **Step 7: Commit** with message `feat: integrate guild reward planning dashboard`.

### Task 9: End-to-end visual and recovery verification

**Files:**
- Modify only files required by defects reproduced in this task, always with a failing regression test first.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a browser-verified integrated workbench at the existing Vite URL.

- [ ] **Step 1: Run the full automated gate**: `npm test`, `npm run lint`, and `npm run build`; record exact counts/output.
- [ ] **Step 2: In the browser verify** desktop wide, single-column breakpoint, and narrow width; score panel first, fixed guild colors, spend zero/data states, per-guild policies, formula invalid/recovery flow, reload persistence, reward totals, and no overflow/console errors.
- [ ] **Step 3: For every observed defect, first add a focused failing automated test, then implement the minimal fix and rerun the focused test.**
- [ ] **Step 4: Repeat the full automated gate and browser checklist after the last fix.**
- [ ] **Step 5: Commit** with message `test: verify integrated alliance simulator` if this task changes code; otherwise record a no-code verification result in the execution ledger.
