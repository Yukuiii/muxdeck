import type { WorkspaceSnapshot } from "../../domain/workspace";

/**
 * 定义 workspace 持久化适配器必须提供的最小能力。
 */
export interface WorkspaceRepository {
  loadSnapshot(): Promise<unknown>;
  saveSnapshot(snapshot: WorkspaceSnapshot): Promise<void>;
}
