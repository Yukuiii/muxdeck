mod error;
mod git_panel;
mod git_panel_commands;
mod pty;
mod terminal_commands;

use pty::TerminalRegistry;

/**
 * 启动 Tauri 应用并注册终端后端命令。
 */
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(TerminalRegistry::default())
        .invoke_handler(tauri::generate_handler![
            terminal_commands::create_terminal_session,
            terminal_commands::write_terminal_input,
            terminal_commands::resize_terminal_session,
            terminal_commands::close_terminal_session,
            git_panel_commands::load_git_panel,
            git_panel_commands::commit_staged_git_changes,
            git_panel_commands::stage_unstaged_git_changes,
            git_panel_commands::stage_git_file,
            git_panel_commands::unstage_all_git_files,
            git_panel_commands::unstage_git_file,
            git_panel_commands::load_git_file_diff
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Muxdeck");
}
