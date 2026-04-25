import { open } from "@tauri-apps/plugin-dialog";
import type { ProjectDirectoryPicker } from "../../application/system/ProjectDirectoryPicker";

/**
 * 使用 Tauri Dialog 实现项目目录选择端口。
 */
export class TauriProjectDirectoryPicker implements ProjectDirectoryPicker {
  /**
   * 打开系统目录选择器并返回单个项目目录。
   */
  async pickProjectDirectory(): Promise<string | undefined> {
    const selected = await open({
      canCreateDirectories: true,
      directory: true,
      multiple: false,
      title: "Add Project",
    });

    if (!selected || Array.isArray(selected)) {
      return undefined;
    }

    return selected;
  }
}
