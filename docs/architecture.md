# Muxdeck 架构说明

## 目标

Muxdeck 采用分层架构，目标是在保持桌面端迭代效率的同时，让 UI、应用规则、平台能力和后端业务边界清晰可替换。

## 前端分层

### domain

`src/domain` 存放纯业务类型和无副作用规则，例如 workspace 项目、终端标签、路径展示名称生成和快照校验。

约束：
- 不允许 import React。
- 不允许 import Tauri API。
- 不允许访问浏览器 DOM。

### application

`src/application` 存放应用服务、端口和组合根，例如 `WorkspaceStore`、`TerminalGateway`、`GitPanelGateway`、目录选择和确认对话框端口。

约束：
- 应用层依赖 domain 类型和端口接口。
- 应用层不直接 import Tauri API。
- 新的外部能力必须先定义端口，再由 infrastructure 实现。

### infrastructure

`src/infrastructure` 存放平台适配器，例如 Tauri command/event、Tauri Store、Tauri Dialog。

约束：
- 只在这里直接 import `@tauri-apps/*`。
- 适配器只做协议转换，不承载业务决策。
- 适配器必须实现 application 层定义的端口。

### ui

`src/ui` 存放 React hook 和组件，负责界面状态、DOM 生命周期和用户交互编排。

约束：
- UI 通过 `applicationServices` 使用应用能力。
- UI 不直接调用 Tauri command、event、store 或 dialog。
- 复杂状态变更优先下沉到 application 层。

## Rust 后端分层

### command

`src-tauri/src/*_commands.rs` 是 Tauri command 适配层，只负责参数接入、状态注入和调用业务服务。

### service

`src-tauri/src/git_panel.rs` 和 `src-tauri/src/pty.rs` 承载后端业务流程，例如 Git 面板读取、提交、PTY 会话生命周期管理。

约束：
- Tauri command 注解不得直接写入 service 模块。
- service 必须返回 `AppResult<T>`，由 command 层向前端透传结构化错误。
- 进程、文件和 Git 命令调用必须有明确超时或资源上限。

## 统一错误模型

后端所有 Tauri command 错误统一使用 `AppError`：

```json
{
  "code": "GIT_COMMAND_FAILED",
  "message": "failed to run git: ..."
}
```

约束：
- `code` 是稳定机器码，用于日志、重试、埋点和前端分支。
- `message` 是人类可读信息，用于界面展示和调试。
- 新增错误类型必须先扩展 `ErrorCode`，禁止直接返回裸字符串。
- 前端必须通过 `normalizeApplicationError` 解析未知异常。

## 依赖方向

依赖只能从外层指向内层：

```text
ui -> application -> domain
infrastructure -> application/domain
command -> service
```

禁止反向依赖，例如 domain 不得引用 application，application 不得引用 infrastructure。

## 验证要求

每次架构相关变更至少运行：

```bash
npx tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
npm run build
npm run tauri build -- --no-bundle
```
