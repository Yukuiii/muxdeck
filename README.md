# Muxdeck

Muxdeck 是一个基于 Tauri 的跨平台终端工作区原型，目标是提供可扩展的多会话终端桌面体验。

## 技术方向

- 桌面壳：Tauri v2
- 前端：Vite + TypeScript
- 终端渲染：xterm.js + WebGL renderer fallback
- PTY 后端：Rust + portable-pty

## 当前骨架

- 纵向 workspace sidebar
- 单 workspace 对应一个真实 PTY shell
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
