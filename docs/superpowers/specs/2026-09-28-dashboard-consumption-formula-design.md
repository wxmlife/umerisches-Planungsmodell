# 公会战模拟器：结果层级、消费策略与可编辑战斗公式设计

日期：2026-09-28

状态：待用户审阅

范围：`alliance-war-numeric-simulator`

## 1. 背景与目标

当前工作台已经能完成六日赛季、连续挑战、消费和敏感性推演，但存在三个直接影响数值策划效率的问题：

1. 最重要的六日积分曲线不是结果区第一张图，阅读顺序与决策优先级不一致。
2. 每日积分来源按“系列顺序”轮换颜色，同一公会的战斗分和占领分会被画成不同色相；消费面板在默认零预算时完全空白，也没有逐公会最终消费汇总。
3. 战斗公式硬编码在领域层，图表内只能看结果，不能就地查看、修改和验证完整计算链。

本次改造的目标是：

- 让赛季结果先于局部校准结果出现。
- 建立按公会固定的视觉身份，并在曲线、柱体、图例和标签中保持一致。
- 用已知阵容和分层消费模板生成可解释的逐公会消费结果，同时允许每个公会独立调节。
- 让数值策划能在连续挑战卡片中安全地编辑战斗公式，并保证图表、六日赛季、蒙特卡洛和敏感性分析使用同一口径。
- 将完整方案保存在本机，避免刷新后丢失调参结果。

## 2. 非目标

本次不包含：

- 公会或偶像风格关系矩阵；六日赛季仍按中性风格计算。
- 任意 JavaScript 执行、脚本插件、循环或自定义函数定义。
- 云端同步、多人协作或后端存储。
- 公式及方案的 JSON 导入导出。
- 用本次消费预设直接解决公会积分平衡。预设用于建立可观察、可调节的分层消费基线，不代表最终平衡目标。

## 3. 信息层级与公会色板

### 3.1 面板顺序

结果区的第一张数据面板改为赛季积分曲线，其后才是“连续挑战曲线”。标题使用动态文案 `${season.days} 日积分曲线`，默认六日方案显示“6 日积分曲线”；英文 eyebrow 不再写死 `SIX-DAY`。恢复比例换算与运行工具栏仍位于结果网格之前，不属于数据面板排序。

### 3.2 单一公会色板

公会颜色必须按 `guildId` 映射，不再依赖对象或系列顺序。初始四公会使用：

| 公会 | 主应援色 | 战斗积分（深色） | 占领积分（浅色） |
|---|---|---|---|
| A | `#57A8FF` | `#2F7ED7` | `#8CC8FF` |
| B | `#F3C665` | `#C79425` | `#F8D98F` |
| C | `#EF7AA8` | `#CF4E82` | `#F6A7C5` |
| D | `#7DD7C4` | `#43AD98` | `#A5E4D7` |

主应援色用于确定性积分线、蒙特卡洛中位线和公会字母标签；蒙特卡洛 P10–P90 带区使用相同主色并设置透明度。深浅变体用于每日积分来源。同一系列的柱体、折线、带区和图例色标必须继承同一显式颜色。

未知公会 ID 使用 UTF-8 字节上的 32 位无符号 FNV-1a 哈希，对以下固定身份色组三元组取模，而不是按当前数组位置取色：前四组即上表 A–D，追加 `(#A78BFA,#7C3AED,#C4B5FD)`、`(#F59E0B,#B45309,#FCD34D)`、`(#22D3EE,#0891B2,#67E8F9)`、`(#F97316,#C2410C,#FDBA74)`。每组三项依次是主色、战斗深色、占领浅色。同一 ID 在对象乱序、刷新和不同图表中必须保持同色。

## 4. 公会消费模型

### 4.1 配置粒度

购买策略从“全局玩家档位策略”升级为“公会 × 玩家档位”的单人版本策略。每个公会的普通、小 R、大 R 均可独立配置：

```ts
interface TierPurchasePolicy {
  versionUsdBudget: number
  versionDiamondBudget: number
  versionAdBudget: number
  useAds: boolean
  supplyPriority: string[]
}

interface GuildConfig {
  // 现有字段省略
  purchasePolicies: Record<Tier, TierPurchasePolicy>
}

interface SupplyConfig {
  // 只保留 offers、adDailyLimit、diamondUsdRate 等全局商城字段；
  // 删除旧 purchasePolicies。
}
```

策略明确挂在 `scenario.guilds[*].purchasePolicies`；商品价格、恢复量、全局每日广告上限和商品每日限购仍属于 `scenario.supply`。公会总消费来自成员实际购买事件之和，而不是简单用人数乘预算上限。

侧栏新增“公会消费策略”区，编辑路径固定为“公会选择器 → 普通/小 R/大 R 页签 → 版本美元预算、版本钻石预算、版本广告预算、启用广告、购买优先级”。切换公会或档位只切换编辑目标，不复制数值。原“商城与补给”区只保留全局商品与限购配置，避免把全局价格和公会行为策略混在一起。

`versionUsdBudget` 必须是有限非负数，按美元存储并以 `0.01` 为 UI 步进；`versionDiamondBudget`、`versionAdBudget` 必须是非负整数。`supplyPriority` 是 `scenario.supply.offers` 中 ID 的有序、不重复子集：省略某个商品表示该档位永不主动购买该商品，不能出现未知或重复 ID。

### 4.2 默认单人六日预算

所有公会初始复制同一档位模板，再允许单独覆盖：

| 档位 | 美元/版本 | 钻石/版本 | 广告/版本 | 启用广告 | 默认优先级（从左到右） |
|---|---:|---:|---:|---|---|
| 普通 | 0 | 120 | 12 | 是 | `ad-or-diamond-ad`, `ad-or-diamond-diamond`, `flyer`, `cheer-stick`, `instant-2000`, `instant-1000`, `instant-600` |
| 小 R | 24 | 0 | 0 | 否 | `flyer`, `cheer-stick`, `instant-2000`, `instant-1000`, `instant-600`, `ad-or-diamond-ad`, `ad-or-diamond-diamond` |
| 大 R | 90 | 0 | 0 | 否 | `flyer`, `cheer-stick`, `instant-2000`, `instant-1000`, `instant-600`, `ad-or-diamond-ad`, `ad-or-diamond-diamond` |

该预设在当前六日赛季和商品价值下，使普通、小 R、大 R 的理论日供给约为 `1 : 2 : 6.4`，低于战力倍率 `1 : 3 : 9`，避免战力与行动次数双重放大。更高的 `$30 / $120` 方案已表现出明显边际收益递减，因此不作为默认值。

`useAds` 是独立的行为开关：只有 `useAds = true`、`versionAdBudget > 0`、广告商品位于优先级列表且全局日上限仍有余额时，玩家才可看广告。仅把广告预算设为正数不会绕过关闭开关。

### 4.3 预算逐日解锁与结转

版本预算按赛季天数线性解锁，未使用额度自动结转。第 `d` 天可用累计上限为：

```text
现金：versionUsdBudget × d / seasonDays
钻石：floor(versionDiamondBudget × d / seasonDays)
广告：floor(versionAdBudget × d / seasonDays)
```

`d` 是当前赛季日的 1 基序号：分钟 `0...1439` 为第 1 日，分钟 `1440...2879` 为第 2 日，以此类推，并限制在 `[1, seasonDays]`。每次购买按三个币种分别判断：

```text
versionSpent + offerCost <= unlockedBudget
```

美元比较允许现有 `EPSILON` 浮点容差；钻石和广告严格按整数比较。一个商品任一非零成本超出当前解锁上限，整次购买都不发生。全局 `adDailyLimit` 仍作为每名玩家的当日硬上限，与 `useAds` 和版本广告预算同时生效。商品的 `dailyPurchaseLimit` 继续按日重置。

玩家新增 `versionUsdSpent`、`versionDiamondSpent`、`versionAdsUsed` 三个版本累计计数；每日状态只保留 `dailyAdsUsed` 和按商品 ID 记录的 `dailyPurchases`，旧 `dailyUsdSpent`、`dailyDiamondSpent` 不再参与资格判断。账本继续记录每次实际消费。赛季天数变化时，解锁曲线自动使用新天数，不改版本总预算。

### 4.4 消费面板

累计消费面板保留现金、钻石、广告总计卡，并新增两层信息：

1. 分组汇总表：默认按公会展示当前场景中的每个公会，每行显示现金、钻石、广告；零消费公会也必须出现。切换到玩家档位或商品时，表格使用对应完整目录，不只展示发生过事件的组。
2. 单币种累计曲线：新增“现金 / 钻石 / 广告”指标选择器，一次只展示一种单位。公会维度下每个当前公会一条线（默认四条），使用公会主应援色；档位和商品维度使用稳定的语义色。

消费图构建器不再只接收事件，而是使用以下完整输入契约：

```ts
interface SpendGroup {
  id: string
  label: string
}

interface CumulativeSpendViewInput {
  events: SpendEvent[]
  groupCatalog: SpendGroup[]
  endMinute: number
  metric: 'usd' | 'diamond' | 'ad'
  dimension: 'guild' | 'tier' | 'offer'
  colorResolver: (groupId: string) => string
}
```

`dimension` 决定从每条事件的 `guildId`、`tier` 或 `offerId` 读取分组键；事件缺少当前维度键属于数据错误，不能静默归入“其他”。`groupCatalog` 按维度分别来自 `scenario.guilds`、固定档位目录 `normal/small/whale` 或 `scenario.supply.offers`；不得硬编码 A–D，也不得为了显示零值而伪造消费事件。`endMinute = season.days * 1440`。档位固定色为普通 `#7DD7C4`、小 R `#F3C665`、大 R `#EF7AA8`；已知商品固定色为奖励广告 `#7DD7C4`、钻石恢复 `#57A8FF`、宣传单 `#F3C665`、应援棒 `#EF7AA8`、即时 600 `#8CC8FF`、即时 1,000 `#A78BFA`、即时 2,000 `#F59E0B`，未知商品沿用稳定 FNV-1a 后备色。

曲线时间轴固定覆盖 `0 → seasonDays × 1440`，即使最后一次消费提前发生也要延伸到赛季终点。没有消费事件时仍显示完整零值汇总和说明文本，不再留下大块空图。面板副标题明确标注“确定性基准消费”；蒙特卡洛结果不会与这本确定性账本混用。

统一美元价值仅在配置钻石美元单价后显示；广告没有价值换算口径，不能被悄然折算进统一总值。

敏感性参数 ID 从 `supply.dailyUsdBudget` 迁移为 `supply.versionUsdBudget`。执行时必须通过 `request.targetGuildId` 找到目标公会，再通过 `request.targetTier` 只修改该公会该档位的 `purchasePolicies[tier].versionUsdBudget`；其他公会和档位保持不变。横轴、默认范围、tooltip、增量收益分母与阈值说明统一使用“单人版本美元预算 / $·人⁻¹·版本⁻¹”，不能继续显示日预算或误改所有公会。

## 5. 可编辑战斗公式

### 5.1 公式配置

场景数据新增四个公式源码字符串：

```ts
interface BattleFormulaConfig {
  preRandomPower: string
  displayedTendency: string
  winProbability: string
  fanLoss: string
}
```

该配置挂在 `scenario.battle.formulas`，不另建组件私有副本。

编辑器标签显示公式字段名，场景中只保存等号右侧表达式；赋值符号不是 DSL 的一部分。四条默认字符串精确定义为：

```ts
const DEFAULT_BATTLE_FORMULAS: BattleFormulaConfig = {
  preRandomPower: 'idolPower <= 0 || initialFans <= 0 || currentFans <= 0 || styleMultiplier <= 0 ? 0 : idolPower * pow(initialFans / 1000, alpha) * pow(currentFans / initialFans, beta) * styleMultiplier',
  displayedTendency: 'attackerPower + defenderPower > 0 ? attackerPower / (attackerPower + defenderPower) : 0.5',
  winProbability: 'uniformWinProbability(attackerPower, defenderPower, randomMin, randomMax)',
  fanLoss: 'round(currentFans * lossBandRate * sideLossFactor)',
}
```

`idolPower = baseIdolPower × tierMultiplier` 仍是固定关系，但基础战力和档位倍率继续可编辑，并在卡片中展示各档位代入后的原始战力。

### 5.2 公式上下文与输出契约

| 公式 | 允许变量 | 输出契约 |
|---|---|---|
| 有效战力 | `idolPower`, `initialFans`, `currentFans`, `styleMultiplier`, `alpha`, `beta` | 有限、非负，且不超过 `1e15` |
| 显示倾向 | `attackerPower`, `defenderPower` | 有限，范围 `[0, 1]` |
| 真实胜率 | `attackerPower`, `defenderPower`, `randomMin`, `randomMax` | 有限，范围 `[0, 1]` |
| 粉丝损失 | `currentFans`, `attackerToDefenderPowerRatio`, `lossBandRate`, `sideLossFactor`, `attackerWon`, `isDefender` | 原始结果有限、非负；领域层四舍五入后限制在 `[0, currentFans]` |

布尔上下文变量在表达式中使用 `true/false`。粉丝损失公式分别为攻守双方求值：进攻方 `sideLossFactor = 1`，守方 `sideLossFactor = homeLossFactor`。

`lossBandRate` 仍由现有损耗档位表根据 `attackerToDefenderPowerRatio` 解析一次，并把同一个比值和档位传给攻守双方的损耗公式，使数值策划既能继续用表调档位，也能在公式中重新组合或完全忽略该值。防守战力大于零时，比值为 `min(1e15, attackerPower / defenderPower)`；若极小正数相除已经产生非有限值，也饱和为 `1e15`。防守战力为零且进攻战力大于零时传有限哨兵 `1e15`；双方战力均为零时传 `0`。

有效战力沿用领域前置保护：`idolPower <= 0`、`initialFans <= 0`、`currentFans <= 0` 或 `styleMultiplier <= 0` 时不执行公式，直接返回零。`currentFans <= 0` 时粉丝损失也短路为零。这些保护与默认源码中的显式条件同时存在，避免 `beta = 0` 时出现 `pow(0, 0) = 1` 改变旧语义。

粉丝损失表达式返回的是“原始损失量”。负数、`NaN` 和无穷是运行错误；有限且非负的结果由领域层统一 `Math.round`，再用 `Math.min(currentFans, roundedLoss)` 截断。超过当前粉丝的有限正数是允许的领域上限截断，不属于错误；除此之外不得把异常结果静默改成零或默认值。

### 5.3 胜负语义

真实胜率公式是全局权威口径，不只用于展示：

```text
attackerWon = rng.next() < winProbability
```

默认公式与原双均匀随机数比较具有相同概率分布。确定性模拟继续使用固定随机源；当固定值恰好等于胜率时，严格小于判断让守方获胜，与当前平局守方保有结果一致。

这次语义收敛会把一次战斗的随机采样从“两次战力扰动后比较”改为“一次伯努利采样”。默认公式保留胜率分布，但同一 seed 的逐场胜负轨迹不承诺与旧实现完全相同；迁移验收比较统计分布和确定性校准值，而不是逐事件快照。

连续挑战图本身不抽取随机胜负，但 `fanLoss` 允许引用 `attackerWon`。因此每个挑战点按以下确定规则推进守方粉丝：先计算 `p = winProbability`，再分别以 `attackerWon = true/false`、`isDefender = true` 求出两个原始守方损失；每个分支先按实际战斗规则做 `min(currentFans, round(rawLoss))`，得到 `lossWin/lossLose`，最后以 `round(p * lossWin + (1 - p) * lossLose)` 作为期望守方损失并限制到 `[0, currentFans]`。下一场以截断后的剩余守方粉丝继续。默认损耗式不引用胜负，因此挑战曲线与旧默认曲线一致。

赛季中的目标效用评估也是权威公式运行时的调用方：候选目标的双方有效战力和真实胜率必须通过同一运行时计算，不能继续调用硬编码的旧 `calculatePreRandomPower` 或 `uniformWinProbability`。因此修改胜率公式既会改变最终抽样，也会改变 AI 对候选节点的效用和选择；正式交战、目标选择、连续挑战、蒙特卡洛和敏感性分析必须共享同一套语义。

### 5.4 安全数学表达式

采用仓库内自研递归下降解析器和白名单求值器，不新增通用脚本执行依赖，并禁止 `eval`、`new Function` 和任意 JavaScript。词法与语义固定如下：

- 数字字面量支持十进制整数、小数和科学计数法；布尔字面量只有 `true`、`false`；允许空白，不允许字符串、注释或隐式分号。
- 运算符由低到高依次为：右结合三元 `?:`；短路左结合 `||`；短路左结合 `&&`；左结合 `== !=`；左结合 `< <= > >=`；左结合 `+ -`；左结合 `* / %`；一元 `+ - !`；右结合 `^`。因此 `-2^2` 为 `-(2^2)`，需要 `(-2)^2` 时必须写括号。
- 算术、一元正负、大小比较只接受数字；`!`、`&&`、`||` 和三元条件只接受布尔；三元两支必须是同一静态类型。不做数字与布尔的隐式转换。`==`、`!=` 只比较同类型原始值，结果为布尔。四条公式的根表达式必须返回数字。
- `/` 或 `%` 的除数为零、函数域错误以及任一步产生非有限数时立即返回运行错误。`&&`、`||` 和三元只求值实际采用的分支。
- 函数签名固定为 `pow(number, number)`、`sqrt(number)`、`abs(number)`、`min(number, number, ...最多 8 项)`、`max(number, number, ...最多 8 项)`、`clamp(number, number, number)`、`round(number)`、`floor(number)`、`ceil(number)`、`log(number)`、`exp(number)`、`uniformWinProbability(number, number, number, number)`；参数数量或类型不符在静态校验阶段报错。
- 常量只有 `PI`、`E`。变量按 5.2 节公式级白名单提供。

递归下降语法以此 EBNF 为准；`IDENT` 区分大小写并匹配 `[A-Za-z_][A-Za-z0-9_]*`，`NUMBER` 匹配 `(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`：

```text
expression     ::= conditional
conditional    ::= logicalOr ("?" expression ":" conditional)?
logicalOr      ::= logicalAnd ("||" logicalAnd)*
logicalAnd     ::= equality ("&&" equality)*
equality       ::= comparison (("==" | "!=") comparison)*
comparison     ::= additive (("<" | "<=" | ">" | ">=") additive)*
additive       ::= multiplicative (("+" | "-") multiplicative)*
multiplicative ::= unary (("*" | "/" | "%") unary)*
unary          ::= ("+" | "-" | "!") unary | power
power          ::= primary ("^" unary)?
primary        ::= NUMBER | "true" | "false" | IDENT
                 | IDENT "(" arguments? ")" | "(" expression ")"
arguments      ::= expression ("," expression)*
```

明确禁止：成员访问、对象、数组、字符串、赋值、多语句、函数定义、循环、递归、位运算、`random`、`Date`、`Math`、`window`、`globalThis` 及未声明标识符。

每条源码最长 512 字符，AST 最多 128 个节点，最大深度 24。编译时固定变量槽位；运行时只传数值/布尔值数组，避免原型链访问。每次求值仍检查输出契约，异常不得静默裁剪为看似正常的结果。

### 5.5 编译与全局一致性

公式源码是 `Scenario` 中唯一需要序列化的内容；AST、字节码或闭包不写入场景，也不通过 `postMessage` 发送。主线程和 Worker 分别编译相同源码。纯语法 AST 可用 `source` 作为键放入每个运行时最多 128 项的 LRU 缓存；完成公式级变量/函数白名单校验和槽位绑定后的可执行程序，必须使用 `(formulaId, source, variableSchemaVersion)` 作为键放入同样最多 128 项的程序缓存，禁止在不同公式上下文之间仅按相同源码复用程序。`variableSchemaVersion` 在变量、常量、函数白名单或槽位顺序改变时递增。

一次 `runSeason`、蒙特卡洛批次或敏感性点运行中必须复用已编译公式，不能在每场战斗重新解析。连续挑战、正式赛季、蒙特卡洛和敏感性分析都调用领域层同一公式运行时，组件不得自行实现第二份计算。

风格倍率仍仅在连续挑战校准图中按当前选择代入；六日赛季传入中性倍率 `1`，界面必须明确标注这一范围。

## 6. 战斗卡片交互

“连续挑战曲线”卡片新增可折叠的“战斗力设定与公式”区域，默认展开摘要、收起长编辑器：

- 快捷参数：基础战力、小 R/大 R 倍率、`alpha`、`beta`、风格关系与优势比例、随机上下限、损耗档位、主场损耗系数。
- 派生值：小 R 与大 R 当前原始战力、当前对阵、代表场次的公式代入结果。
- 四个公式页签：每个页签包含源码编辑区、允许变量、允许函数、当前状态，以及“恢复上个有效”“恢复默认公式”。
- 公式和参数使用同一场景状态；侧栏原入口保留并同步。共享控件必须支持唯一的 ID 前缀，不能产生重复 DOM ID。

战斗卡片和侧栏都编辑 `draftScenario`，任一处修改后另一处必须在同一渲染周期显示相同值；图表、派生值和确定性结果只读取 `appliedScenario`。公式 textarea 输入后采用固定 `300 ms` 防抖进入校验流程；普通数字控件在一次完整 change/blur 提交后进入同一流程。

“恢复上个有效”只把当前公式字段从 `appliedScenario` 复制到 `draftScenario`；“恢复默认公式”只复制该公式的代码内默认 RHS，不重置其他参数。非法草稿就地显示错误位置和整理后的原因，并显示“当前公式未应用”；旧图表继续可见。

结果网格的 stale 样式只下沉到图表、表格和结果摘要容器，不能给包含编辑器的祖先设置整体透明度。`aria-busy` 也只标记正在重算的结果容器，编辑控件始终保持可读、可聚焦和可操作。

## 7. 本地持久化

完整可编辑方案在本机自动保存，包括场景参数、四条公式、公会购买策略和分析选择；运行结果、Worker 状态、编译缓存、`pendingScenario` 和进度不保存。主存储键为 `alliance-war-simulator/scenario/v3`，格式固定为：

```ts
interface PersistedEnvelopeV3 {
  schemaVersion: 3
  savedAt: string
  draftScenario: Scenario
  appliedScenario: Scenario
  analysis: {
    targetGuildId: string
    targetTier: Tier
    targetNodes: Record<NodeKind, number>
    sensitivityParameter: SensitivityParameter
    sensitivityMetric: SensitivityMetric
    sweepMin: number
    sweepMax: number
    sweepStep: number
  }
}
```

草稿或分析选择变化后 `300 ms` 防抖保存；新的候选方案成功应用后立即保存一次。正在运行的候选方案不会成为 `appliedScenario`，因此刷新不会把“编译成功但运行失败”的场景误当成有效方案。`localStorage` 的读取、写入、删除和容量异常全部捕获为非致命存储提示，不能中断模拟。

启动时必须先走不抛异常的未知数据解码层，不能把 `JSON.parse` 的任意结果直接传给假定结构完整的 `validateScenario`：

1. 捕获 JSON 解析错误，把值视为 `unknown`。
2. 按 `schemaVersion` 执行纯数据迁移；未知的未来版本拒绝加载。
3. 用逐层类型守卫检查对象、数组、标量和必需字段，得到可安全访问的候选 `Scenario`；公式源码只要求是字符串，语法错误留给后续编译器，从而保留用户的非法草稿文本。
4. 对解码后的 applied 候选执行领域校验、公式解析/类型校验和确定性基准运行；对 draft 候选先执行领域与公式静态校验，用于恢复编辑状态和错误提示。任何一步都转换为可展示的错误结果，不向 React 渲染链抛异常。

旧数据迁移规则是确定的：缺少公式时写入 5.1 节默认 RHS；旧 `scenario.supply.purchasePolicies[tier]` 对每个现有公会做深复制并移入 `guild.purchasePolicies[tier]`；`versionUsdBudget = dailyUsdBudget * season.days`，`versionDiamondBudget = dailyDiamondBudget * season.days`，`versionAdBudget = useAds ? supply.adDailyLimit * season.days : 0`，`useAds` 与原优先级原样保留；随后删除全局策略。旧 `lastValidScenario` 映射为 `appliedScenario`。持久化分析项 `sensitivityParameter = 'supply.dailyUsdBudget'` 必须迁移为 `'supply.versionUsdBudget'`；不存在或失效的分析目标公会回退到第一个公会，档位回退为 `whale`，其他分析数值仍须通过正常校验。

恢复顺序为：先尝试验证并运行 `appliedScenario`，成功后用它出图；失败则改用代码内默认方案。结构可解码的 `draftScenario` 随后加载到编辑器：若与 applied 不同且静态校验通过，立即按正常 revision 流程进入 pending 并重跑确定性基准；若公式或参数无效，则保留原文、显示错误并继续用 applied 出图。草稿结构无法解码时才改用已恢复的 applied/default 作为新草稿。只要原始载荷发生 JSON、迁移、结构或首次运行错误，就把原始字符串写入单槽恢复键 `alliance-war-simulator/recovery/latest`，并显示“查看恢复数据 / 复制 JSON / 清除备份”入口。该入口只用于诊断和手工取回文本，不构成 JSON 导入功能。

“恢复默认方案”必须二次确认，清除本地数据并加载代码内默认值。普通参数编辑不出现确认弹窗。

## 8. 状态与错误处理

- `draftScenario` 保存用户当前输入；`pendingScenario` 是已通过结构、领域和公式静态校验且正在执行确定性基准的候选；`appliedScenario` 只保存最近一次完整运行成功的方案。三者必须是独立快照，不能共享可变嵌套对象。
- 每次编辑递增 `revision`，取消或失效旧的确定性、蒙特卡洛和敏感性任务，并清除旧分析展示。防抖校验通过后创建 `{ revision, scenario }` 的 pending；只有该 revision 的连续挑战序列与固定 seed 赛季都完整成功，且完成时仍是最新 revision，才能原子替换 applied 及其确定性结果。静态校验或确定性运行失败时只记录草稿错误并清空 pending，applied 不变。
- 蒙特卡洛或敏感性是在 applied 上启动的附加分析。它们的公式错误只令对应分析失败，不回滚已成功应用的确定性方案；修改草稿仍沿用现有取消与失效逻辑。
- 参数或公式无效时，不用零值、默认公式或部分新公式覆盖结果。
- 若当前公式没有引用 `alpha`、`beta` 等可扫描变量，对应敏感性曲线变平是合法结果；界面提示“当前公式未引用该参数”，不判为错误。

公式编译和运行错误必须能安全跨 Worker 传输，并统一归一化为：

```ts
type FormulaId = keyof BattleFormulaConfig
type FormulaErrorPhase = 'parse' | 'typecheck' | 'runtime' | 'output'
type FormulaErrorCode =
  | 'UNEXPECTED_TOKEN'
  | 'SOURCE_TOO_LONG'
  | 'AST_LIMIT'
  | 'UNKNOWN_IDENTIFIER'
  | 'TYPE_MISMATCH'
  | 'INVALID_ARITY'
  | 'DIVIDE_BY_ZERO'
  | 'FUNCTION_DOMAIN'
  | 'NON_FINITE'
  | 'OUTPUT_RANGE'
type FormulaErrorContext =
  | 'draft-validation'
  | 'deterministic'
  | 'monte-carlo'
  | 'sensitivity'

interface FormulaErrorDto {
  kind: 'formula'
  formulaId: FormulaId
  phase: FormulaErrorPhase
  code: FormulaErrorCode
  message: string
  context: FormulaErrorContext
  range?: { start: number; end: number } // 源码 UTF-16 偏移，左闭右开
  variables?: Record<string, number | boolean>
}
```

`message` 来自固定错误码模板；`variables` 只包含该公式白名单中的有限标量并限制数量，不包含场景对象、源码、内部堆栈或异常实例。主线程对未知 Worker 错误归一化为通用分析失败消息，日志可记录内部错误，但 UI 不显示堆栈。

## 9. 测试与验证

实施采用测试先行。至少覆盖：

### 9.1 页面与配色

- 结果网格第一张数据卡是赛季积分；`season.days = 1/6/14` 时标题分别显示“1/6/14 日积分曲线”，aria label 也使用相同动态天数。
- 公会对象乱序时，确定性积分线、蒙特卡洛中位线和 P10–P90 带区仍按 ID 获得主应援色；带区只改变透明度，不改变色相。
- 每个公会的战斗/占领积分分别使用其深/浅色，柱体、图例和 tooltip 色标一致。
- 节点与粉丝、补给效率的公会标签使用目标公会主应援色；未知 ID 在乱序、刷新及不同图表中得到相同后备色。
- 战斗卡与侧栏修改同一参数时双向同步；渲染完整页面后所有非空 DOM `id` 唯一，`label[for]` 均命中唯一控件。

### 9.2 消费模型

- 公会 × 档位策略能独立覆盖，不串用其他公会配置。
- 在第 1 日起点、第 1 日末、第 2 日起点和赛季末分别验证 `versionSpent + offerCost <= unlockedBudget`；恰好等于上限可购买，超过最小货币单位不可购买，未使用预算可结转。
- 美元接受约定的 `EPSILON`，钻石和广告拒绝小数配置；`useAds`、版本广告预算、每日广告上限和广告商品优先级缺一不可。
- 普通、小 R、大 R 默认优先级逐项等于 4.2 节 ID 数组；未知、重复 ID 被拒绝，合法子集可用来禁购商品。
- 当前场景每个公会都出现在汇总表；零消费配置仍显示全目录零值，新增或改名公会不需要修改组件常量。
- 汇总表逐项与账本、公会最终快照对账。
- 曲线覆盖完整赛季，切换资源后单位、系列数量、固定语义色和 tooltip 正确，并显示“确定性基准消费”。
- `supply.versionUsdBudget` 扫描只修改 `targetGuildId + targetTier`；其余策略深度相等，横轴和阈值无“日预算”残留。

### 9.3 公式引擎

- 四条默认字符串都是不含赋值的 RHS，并逐点复现旧挑战曲线的有效战力、显示倾向、解析胜率、损耗率和默认守方损失。
- `uniformWinProbability` 在固定战力比网格上与旧解析值逐项相等；新伯努利实现在 50,000 个固定 seed 样本中的观测胜率与解析值绝对误差不超过 `max(0.01, 4 * sqrt(p * (1 - p) / 50000))`。新算法建立自己的固定 seed 赛季基线，不断言旧逐事件轨迹相等。
- 对 `attackerWon` 分支返回不同损耗的公式，挑战图先分别 round/cap 两个分支，再按 `p * lossWin + (1-p) * lossLose` 取整推进；实际战斗只使用已抽出的胜负分支。
- 把胜率公式改为常量 `0` 或 `1` 时，正式战斗结果、候选目标效用和可构造的目标选择都按新值改变；挑战图、Worker 蒙特卡洛和敏感性也读取相同公式。
- 覆盖运算符优先级/结合性、三元与布尔短路、每个函数参数数量和类型；未知变量/函数、成员访问、赋值、数组、字符串、`random`、过长/过深表达式均被拒绝。
- 除零、负数开方、溢出、`NaN`、`Infinity` 和越界概率产生明确错误。
- `currentFans = 0, beta = 0` 仍短路为零战力；零守方只向公式传 `0` 或 `1e15` 的有限 `attackerToDefenderPowerRatio`；守方为极小正战力且除法溢出时也饱和为 `1e15`。
- 粉丝损失为负数或非有限数时报错，超过当前粉丝的有限正数在四舍五入后截断到当前粉丝。
- 同一源码分别放入不同公式时仍执行各自变量白名单；测试注入编译计数器，断言一次模拟中每个唯一 `(formulaId, source, variableSchemaVersion)` 最多编译一次，战斗次数增加不会增加解析/编译次数，不使用墙钟耗时阈值。

### 9.4 状态生命周期

- 静态校验通过但确定性运行报错的候选不会覆盖 applied；旧结果和非法草稿同时保留。
- 较旧 revision 晚完成时被忽略，只有最新 revision 能原子更新 applied 与确定性结果。
- pending 期间编辑器绑定 draft、图表绑定 applied；stale/`aria-busy` 样式不降低编辑器透明度、不阻止聚焦。
- 蒙特卡洛或敏感性单独失败不会回滚 applied；修改草稿会取消或失效旧分析。
- “恢复上个有效”和“恢复默认公式”只改当前公式字段，并重新进入同一校验流程。

### 9.5 持久化

- 合法 v3 envelope 跨刷新恢复，pending 和运行结果不恢复而是重新计算；非法公式草稿跨刷新原样保留，但继续用 applied 出结果。
- 旧结构能补入默认公式，把全局档位策略深复制给各公会，按 `days` 正确迁移三类版本预算和 `useAds`，并把旧敏感性参数 ID 改为 `supply.versionUsdBudget`。
- 逐项覆盖空字符串、损坏 JSON、数组代替对象、缺失嵌套字段、未知未来版本、无效 applied 和首次运行错误；所有情况都不会白屏或把 `unknown` 直接传给领域校验。
- 错误原始载荷写入 recovery 键，“查看 / 复制 / 清除”可操作；合法非法公式草稿不需要 recovery 键即可在编辑器恢复。
- 恢复默认会清除主存档与恢复备份并重建默认状态。
- Worker 返回的 `FormulaErrorDto` 可结构化克隆；UI 不显示堆栈、异常实例或非白名单变量。

### 9.6 完成门槛

- 全量单元与集成测试通过。
- lint 与生产构建通过。
- 在浏览器中验证桌面宽屏、单列断点和窄屏；公式错误、消费空态、颜色图例和首屏顺序均可见且无溢出。
- 默认消费预设下消费图有数据；同时明确记录默认预设会强化当前 `C > A > B > D` 的排名趋势，不能误称为平衡完成。

## 10. 分阶段实施与验证门槛

本总规格拆成三个顺序实施、可独立回退的阶段；后一阶段不得在前一阶段门槛失败时开始：

1. **信息层级、配色与逐公会消费。** 完成动态赛季标题、面板顺序、统一公会色解析器、`GuildConfig.purchasePolicies` 迁移、版本预算规则、消费面板输入契约和预算敏感性迁移。门槛是 9.1、9.2 全部测试以及现有全量测试、lint、构建通过，并在浏览器确认默认消费有数据和零值目录可见。
2. **公式 DSL 与领域运行时。** 完成解析器、类型/输出校验、缓存、四个公式调用、挑战期望损耗、正式战斗、目标选择、Worker 蒙特卡洛和敏感性接线。此阶段先保留代码内默认公式，不开放编辑入口。门槛是 9.3 全部测试、旧挑战确定值回归、新固定 seed 基线以及全量测试、lint、构建通过。
3. **编辑状态与本地恢复。** 完成 `draft → pending → applied` 生命周期、战斗卡编辑器、侧栏同步、错误 DTO 展示、v3 envelope、迁移、恢复入口和默认重置。门槛是 9.4、9.5、9.6 全部通过，并完成桌面、单列和窄屏人工验收。

每阶段单独提交，提交说明列出该阶段的迁移与验证结果；任何阶段都不依赖下阶段才能保持应用可运行。

## 11. 风险与后续方向

- 自由公式会使部分既有参数失去作用；通过“当前公式未引用”提示解决，不强迫公式引用所有参数。
- 四条公式全局生效后，极端表达式可能显著增加模拟耗时；通过无循环 DSL、AST 上限、编译缓存与运行时输出检查控制风险。
- 当前商品价值差异较大：即时补给的粉丝/美元价值明显低于宣传单，应援棒受粉丝池容量影响浪费较高。默认策略只把宣传单作为付费档首选，不在本次修改商品价格。
- 默认消费预设让消费数据可见，但当前阵容下 C 公会仍明显领先。后续若目标变为竞技平衡，应单独开展阵容、行动容量、积分与消费联合校准。
- 若未来需要团队共享方案，再增加显式 JSON 导入导出或后端版本库；本次本地自动保存不承担协作职责。
