备用，之后做成功能

### Tauri 功能扩展配置清单

以下配置项可以帮助您为应用程序添加新功能或增强与操作系统的集成。

---

#### 1. 系统托盘图标 (`app.trayIcon`)

此配置用于在操作系统（如 Windows 的任务栏通知区域或 macOS 的菜单栏）中创建一个系统托盘图标。

- **功能扩展**: 允许应用在后台运行，并通过托盘图标菜单提供快捷操作，即使用户关闭了主窗口。
- **示例**:
  ```json
  "app": {
    "trayIcon": {
      "iconPath": "icons/icon.png",
      "tooltip": "我的应用",
      "iconAsTemplate": true
    }
  }
  ```

---

#### 2. 内置更新器 (`bundle.createUpdaterArtifacts`)

开启此功能后，Tauri 在构建应用时会自动生成更新所需的文件（如签名和 JSON 清单）。

- **功能扩展**: 为您的应用程序启用自动更新功能。您可以集成 tauri-plugin-updater 或手动检查更新，让用户无缝升级到新版本。
- **示例**:
  ```json
  "bundle": {
    "createUpdaterArtifacts": true
  }
  ```

---

#### 3. 捆绑外部二进制文件 (`bundle.externalBin`)

允许您将一个或多个预编译的二进制可执行文件打包到您的应用程序中。

- **功能扩展**: 您可以从前端调用这些外部程序，执行一些 Web 技术栈难以完成的复杂或高性能任务，例如运行一个用 Go/Python 编写的后端服务或命令行工具。
- **示例**:
  ```json
  "bundle": {
    "externalBin": ["binaries/my-cli-tool", "binaries/another-service"]
  }
  ```

---

#### 4. 捆绑额外资源 (`bundle.resources`)

此配置可以将任意文件或文件夹打包到最终的应用资源目录中。

- **功能扩展**: 允许应用在运行时访问和使用这些静态资源，例如配置文件、数据库文件、媒体文件或文档。
- **示例**:
  ```json
  "bundle": {
    "resources": [
      "assets/database.sqlite",
      "assets/templates/"
    ]
  }
  ```

---

#### 5. 文件关联 (`bundle.fileAssociations`)

允许您的应用程序注册为特定文件类型的默认或可选打开方式。

- **功能扩展**: 增强了应用与操作系统的集成度。用户可以直接通过双击关联文件（例如 `.md` 或 `.json` 文件）来启动您的应用并打开该文件。
- **示例**:
  ```json
  "bundle": {
    "fileAssociations": [
      {
        "ext": ["log", "txt"],
        "name": "Text File",
        "role": "Editor"
      }
    ]
  }
  ```

---

#### 6. 拖放功能 (`app.windows[].dragDropEnabled`)

控制是否启用 Tauri 的原生拖放功能。

- **功能扩展**: 默认为 `true`，允许用户将文件从操作系统拖入窗口，并通过 Tauri 后端事件进行处理。如果需要使用 HTML5 标准的拖放 API，则应将其设置为 `false`（尤其是在 Windows 上）。
- **示例**:
  ```json
  "app": {
    "windows": [
      {
        "dragDropEnabled": false
      }
    ]
  }
  ```

---

#### 7. 窗口透明化 (`app.windows[].transparent`)

使窗口背景变为透明，允许您创建异形或完全自定义外观的窗口。

- **功能扩展**: 结合无边框窗口（`"decorations": false`），可以实现现代、美观的自定义界面，摆脱原生窗口的样式限制。在 macOS 上可能需要启用私有 API（`"macOSPrivateApi": true`）。
- **示例**:
  ```json
  "app": {
    "macOSPrivateApi": true,
    "windows": [
      {
        "transparent": true,
        "decorations": false
      }
    ]
  }
  ```

---

#### 8. 原生窗口视觉效果 (`app.windows[].windowEffects`)

为窗口添加平台原生的视觉效果，例如 Windows 11 的 Mica 或 Acrylic 模糊效果。

- **功能扩展**: 提升了应用的视觉表现力，使其能更好地融入现代操作系统。此功能通常需要将窗口设置为透明（`transparent: true`）。
- **示例**:
  ```json
  "app": {
    "windows": [
      {
        "transparent": true,
        "decorations": false,
        "windowEffects": {
          "effects": ["mica"]
        }
      }
    ]
  }
  ```

---

#### 9. 插件配置 (`plugins`)

这是 Tauri 扩展核心功能最主要的方式。通过引入插件，您可以轻松地为应用添加原生能力。

- **功能扩展**:
  - **`tauri-plugin-store`**: 提供持久化键值存储。
  - **`tauri-plugin-notification`**: 发送原生系统通知。
  - **`tauri-plugin-sql`**: 连接并操作多种 SQL 数据库。
  - **`tauri-plugin-window-state`**: 自动保存和恢复窗口的大小和位置。
- **示例**:
  ```json
  "plugins": {
    "store": {
      "defaultPath": ".settings.dat"
    },
    "notification": {
      "icon": "icons/icon.png"
    }
  }
  ```
