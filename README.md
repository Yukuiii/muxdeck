# Muxdeck

Muxdeck 是一个面向开发者的跨平台终端 Agent 代理工作区，目标是在一个桌面界面里集中管理多个 shell 会话、Agent 任务和项目上下文。

## 产品定位

- 为开发者提供可并行运行、观察和切换的终端 Agent 会话
- 以 workspace 为核心组织项目、shell、任务状态和后续自动化能力
- 保持跨平台桌面发布路径，避免绑定单一操作系统

## 技术方向

- 桌面壳：Tauri v2
- 前端：Vite + React + TypeScript + Tailwind CSS
- 终端渲染：xterm.js + WebGL renderer fallback
- PTY 后端：Rust + portable-pty
- 架构约束：[docs/architecture.md](docs/architecture.md)

## 当前实现

- 纵向 workspace sidebar
- 初始空项目状态，选择项目目录后再初始化终端
- 单项目支持多个终端 tabs，每个 tab 对应一个真实 PTY shell
- 新建终端 tab 会继承当前项目目录作为工作目录
- 前端输入转发到 Rust 后端
- Rust 后端输出通过 Tauri event 写回 xterm.js
- 终端 resize 同步到 PTY
- 项目和终端 tab 元数据通过 Tauri Store 持久化
- 右侧 Git 面板展示当前项目的暂存变更和提交历史

## 开发命令

```bash
npm install
npm run tauri dev
```

## 验证命令

```bash
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --no-bundle
```
