import { load, type Store } from "@tauri-apps/plugin-store";
import type { WorkspaceRepository } from "../../application/workspace/WorkspaceRepository";
import type { WorkspaceSnapshot } from "../../domain/workspace";

const WORKSPACE_STORE_PATH = "workspace.json";
const WORKSPACE_SNAPSHOT_KEY = "workspace";

/**
 * 使用 Tauri Store 实现 workspace 快照持久化。
 */
export class TauriWorkspaceRepository implements WorkspaceRepository {
  /**
   * 创建 Tauri Store 仓储并加载底层 store 文件。
   */
  static async create(): Promise<TauriWorkspaceRepository> {
    const store = await load(WORKSPACE_STORE_PATH, {
      defaults: {},
      autoSave: false,
    });

    return new TauriWorkspaceRepository(store);
  }

  /**
   * 保存已加载的 Tauri Store 实例。
   */
  private constructor(private readonly store: Store) {}

  /**
   * 从 Tauri Store 读取 workspace 快照。
   */
  loadSnapshot(): Promise<unknown> {
    return this.store.get<WorkspaceSnapshot>(WORKSPACE_SNAPSHOT_KEY);
  }

  /**
   * 将 workspace 快照写入 Tauri Store。
   */
  async saveSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
    await this.store.set(WORKSPACE_SNAPSHOT_KEY, snapshot);
    await this.store.save();
  }
}
