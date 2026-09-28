use tauri::{
    menu::{AboutMetadata, Menu, SubmenuBuilder},
    AppHandle, Wry,
};

pub fn localized_menu(app: &AppHandle, chinese: bool) -> tauri::Result<Menu<Wry>> {
    let label = |zh, en| if chinese { zh } else { en };
    let app_menu = SubmenuBuilder::new(app, "SpaceTiles")
        .about_with_text(
            label("关于 SpaceTiles", "About SpaceTiles"),
            Some(AboutMetadata {
                name: Some("SpaceTiles".into()),
                version: Some(app.package_info().version.to_string()),
                ..Default::default()
            }),
        )
        .separator()
        .services_with_text(label("服务", "Services"))
        .separator()
        .hide_with_text(label("隐藏 SpaceTiles", "Hide SpaceTiles"))
        .hide_others_with_text(label("隐藏其他", "Hide Others"))
        .show_all_with_text(label("显示全部", "Show All"))
        .separator()
        .quit_with_text(label("退出 SpaceTiles", "Quit SpaceTiles"))
        .build()?;
    let file = SubmenuBuilder::new(app, label("文件", "File"))
        .close_window_with_text(label("关闭窗口", "Close Window"))
        .build()?;
    let edit = SubmenuBuilder::new(app, label("编辑", "Edit"))
        .undo_with_text(label("撤销", "Undo"))
        .redo_with_text(label("重做", "Redo"))
        .separator()
        .cut_with_text(label("剪切", "Cut"))
        .copy_with_text(label("拷贝", "Copy"))
        .paste_with_text(label("粘贴", "Paste"))
        .select_all_with_text(label("全选", "Select All"))
        .build()?;
    let view = SubmenuBuilder::new(app, label("显示", "View"))
        .fullscreen_with_text(label("切换全屏", "Toggle Full Screen"))
        .build()?;
    let window = SubmenuBuilder::new(app, label("窗口", "Window"))
        .minimize_with_text(label("最小化", "Minimize"))
        .maximize_with_text(label("缩放", "Zoom"))
        .separator()
        .close_window_with_text(label("关闭窗口", "Close Window"))
        .build()?;
    Menu::with_items(app, &[&app_menu, &file, &edit, &view, &window])
}
