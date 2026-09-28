# 公会战数值模拟器

一个无后端、仅在本机运行的 React + TypeScript 单页工作台，用于校准公会战战斗、六日赛季、粉丝恢复、补给效率和消费阈值。计算在浏览器内完成，不会部署服务或写回外部系统。

## 本地运行

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm preview
```

开发服务器会显示本地访问地址。`pnpm build` 生成静态产物到 `dist/`，`pnpm preview` 可在本机预览该产物。

## 模型口径

默认参数和验收口径来自只读设计规范：`/Users/apple/Documents/ChatGPT/IDOL策划/docs/superpowers/specs/2026-09-24-alliance-war-numeric-simulator-design.md`。

- 基准推演在有效参数变化后自动更新；蒙特卡洛与敏感性分析由按钮触发，并在 Web Worker 中运行。
- 现金、钻石和广告始终分开记账。只有输入钻石美元单价后，界面才额外显示统一货币口径。
- 第一版使用聚合节点模型，不包含真实地图拓扑、后端或外部数据写回。
