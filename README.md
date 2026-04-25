# Muxdeck

Muxdeck 是一个面向开发者的跨平台终端 Agent 代理工作区，目标是在一个桌面界面里集中管理多个 shell 会话、Agent 任务和项目上下文。

## 产品定位

- 为开发者提供可并行运行、观察和切换的终端 Agent 会话
- 以 workspace 为核心组织项目、shell、任务状态和后续自动化能力
- 保持跨平台桌面发布路径，避免绑定单一操作系统

## 技术方向

- 桌面壳：Tauri v2
- 前端：Vite + TypeScript
- 终端渲染：xterm.js + WebGL renderer fallback
- PTY 后端：Rust + portable-pty

## 当前实现

- 纵向 workspace sidebar
- 初始空项目状态，选择项目目录后再初始化终端
- 单 workspace 对应一个以项目目录为工作目录的真实 PTY shell
- 前端输入转发到 Rust 后端
- Rust 后端输出通过 Tauri event 写回 xterm.js
- 终端 resize 同步到 PTY

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
