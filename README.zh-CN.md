<div align="center">
  <img src="src-tauri/icons/icon.png" alt="SpaceTiles 图标" width="88" />
  <h1>SpaceTiles</h1>
  <p><a href="README.md">English</a> | 简体中文</p>
  <p>看见空间的去向</p>
  <p>macOS 磁盘空间分析工具 · Tauri + Rust + React · MIT</p>
</div>

SpaceTiles 把文件和目录铺成一张层层嵌套的矩形图：占用越大，方块越大。选择一个目录，就能查看空间分布，逐层找到大文件，再到 Finder 中处理。

这是一个出于兴趣开发的开源项目，目前为 **0.1 MVP**，优先完善 macOS 体验。未来可能支持 Windows 和 Linux，当前尚未适配。

## 界面预览

首页，可以选择目录开始扫描，也可以先打开示例体验。

![SpaceTiles 首页](screenshots/home.png)

扫描结果与目录列表同步展示，详情侧栏可以收起，给矩形图留出更多空间。

![SpaceTiles 扫描结果：嵌套矩形图、空间统计和目录列表](screenshots/detail1.png)

## 功能

- **空间矩形图**：单击查看详情，双击进入目录，通过面包屑返回上级。
- **按类型配色**：每次启动默认按类型配色，识别 203 种扩展名，涵盖图片、视频、音频、文稿、表格、演示、压缩包、安装包、代码、数据、设计和字体；也可切换为按目录配色。目录和未知类型单独标色。
- **后台扫描**：展示扫描进度，支持停止和重新扫描，读取失败时标记结果不完整。
- **两种大小口径**：切换逻辑大小与已分配大小。
- **目录列表**：按大小排序，支持只看当前目录的直属文件，以及在 Finder 中定位。
- **macOS 界面**：玻璃材质、紧凑工具栏、系统明暗主题。点击左上角品牌区返回首页，保留本次扫描结果。
- **自动语言**：macOS 端跟随系统首选语言，中文（含繁体中文语言设置）统一显示简体中文，其他语言显示英文。可在「设置 → 界面语言」中选择「跟随系统 / 简体中文 / English」，立即生效、保留扫描结果并记住选择。跟随系统模式下，修改系统语言后重新启动应用；网页预览跟随浏览器首选语言。原生权限弹窗语言由 macOS 管理。
- **示例模式**：不扫描真实文件也能体验界面。

扫描在本机进行，不读取文件内容，不上传文件信息。当前不提供文件删除、自动清理、后台监听或历史扫描对比。

## 开始使用

1. 打开应用，点击「选择一个目录」。
2. 等待扫描，或在扫描过程中浏览已经发现的文件。
3. 双击较大的目录方块继续深入，单击文件查看大小和路径。
4. 需要处理文件时，点击「在 Finder 中显示」。

当前应用配置的最低系统版本为 **macOS 13**，已在 Apple Silicon 上进行实机验证；旧系统与 Intel 设备仍待验证。窗口材质随系统版本而异。

项目尚未完成 Developer ID 签名和公证，目前主要通过源码构建体验。

## 本地开发

需要 Node.js **22.12+**、Rust 稳定版和 Xcode Command Line Tools。首次构建需要联网下载依赖。

```sh
npm ci
npm run desktop
```

`desktop` 会同时启动 Vite 和桌面应用，保存源码后自动更新。

仅预览网页界面：

```sh
npm run dev
```

访问 <http://127.0.0.1:1420/>，点击「打开示例」。网页预览不支持本机目录扫描。

这两个命令共用 **1420** 端口，不要同时运行。如果提示端口被占用，先在原开发服务的终端按 `Ctrl+C`，再启动桌面开发。

### 打包

```sh
npm run package
```

按当前电脑架构构建，应用输出位置：

```text
src-tauri/target/release/bundle/macos/SpaceTiles.app
```

### 检查

```sh
npm run check
npm test
npm run format:check
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

## 权限与统计口径

**普通目录扫描不要求默认开启完全磁盘访问权限。** 部分目录受 macOS 隐私保护或文件权限限制，读取失败会显示错误明细。需要扫描这些位置时，可从应用的权限说明进入系统设置；选择目录不代表取得整盘读取权限。

**已分配大小不等于删除后可释放的空间。** APFS 的克隆、共享块和快照会影响实际可回收容量。硬链接去重后计入首先发现的路径，符号链接不跟随，不跨设备挂载点；应用包按目录扫描。

扫描结果不是文件系统的瞬时快照。扫描中修改文件、主动停止或读取失败，都可能使统计不完整。为保持界面响应，图中会合并部分小项，目录列表最多显示最大的 100 项；可以进入子目录继续查看。「仅文件」只包含当前目录的直属文件。

完整的 TCC 授权流程、不同 macOS 版本兼容性，以及大规模扫描的内存和性能仍在完善中。

## 项目结构

```text
src/
  components/Treemap.tsx   Canvas 绘制与交互
  lib/layout.ts           矩形布局与命中检测
  lib/fileTypes.ts        文件类型与配色
  lib/i18n.ts             语言检测与界面翻译
  App.tsx                 扫描流程与界面
src-tauri/src/
  scanner.rs              目录扫描、大小聚合与查询
  main.rs                 桌面命令与 macOS 集成
tests/                    前端测试
screenshots/              README 软件截图
```

欢迎提交问题反馈和改进。报告扫描或权限问题时，请附上 macOS 版本、芯片架构、操作步骤和错误信息；文件路径可先脱敏。

## 致谢与许可

矩形图的空间探索方式受到 SpaceSniffer 启发。SpaceTiles 是独立项目，未使用其源代码或视觉素材，也不隶属于 SpaceSniffer。

采用 [MIT 许可证](LICENSE)。
