/**
 * 定义选择项目目录的系统交互端口。
 */
export interface ProjectDirectoryPicker {
  pickProjectDirectory(): Promise<string | undefined>;
}
