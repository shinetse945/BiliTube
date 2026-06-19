# BiliTube — 技术文档

> 本文档面向后续维护者（包括 AI），帮助快速理解项目结构、各文件职责、编译流程与输出路径。

---

## 1. 项目概览

BiliTube 是一个 **Chrome 浏览器扩展（Manifest V3）**，核心功能是在 YouTube 视频上叠加来自 Bilibili 的弹幕。

技术栈：React 18 + Webpack 5 + Babel + Material UI 5 + i18next + CommentCoreLibrary。

---

## 2. 仓库目录结构

```
BiliTube/                        ← Git 仓库根目录
├── README.md
├── TECHNICAL.md                  ← 本技术文档
├── LICENSE
├── .gitignore
├── extension/                    ← 【编译输出目录】，Chrome 加载此文件夹
│   ├── manifest.json             ← 由 build.js 从 public/ 复制
│   ├── background.js             ← 由 build.js 从 public/ 复制
│   ├── content.js                ← 由 webpack 打包 src/ 生成
│   ├── content.js.LICENSE.txt    ← webpack 自动生成的许可证文件
│   └── icons/                    ← 由 build.js 从 public/icons/ 复制
│
├── bilitube/                    ← 【源码工作目录】
│   ├── .babelrc                  ← Babel 配置（preset-env + preset-react）
│   ├── .env                      ← 环境变量（API 地址）
│   ├── .env.example              ← 环境变量示例
│   ├── .gitignore
│   ├── package.json              ← 依赖与脚本定义
│   ├── package-lock.json
│   ├── webpack.config.js         ← Webpack 打包配置
│   ├── build.js                  ← 静态资源复制脚本
│   ├── public/                   ← 扩展静态资源（不经过 webpack）
│   │   ├── manifest.json         ← Chrome 扩展清单文件
│   │   ├── background.js         ← Service Worker（背景脚本）
│   │   ├── favicon.ico
│   │   └── icons/                ← 扩展图标资源
│   └── src/                      ← React 源码
│       ├── index.js              ← 入口文件
│       ├── App.js                ← 主面板组件
│       ├── AccessTokenContext.js  ← 认证 Token 上下文
│       ├── content/              ← UI 组件与样式
│       ├── danmaku/              ← 弹幕引擎
│       └── i18n/                 ← 国际化
│
└── node_modules/                 ← 根目录也有，但主要依赖在 bilitube/node_modules/
```

---

## 3. 编译与构建

### 3.1 前置条件

```bash
cd bilitube
npm install
```

### 3.2 构建命令

```bash
cd bilitube
npm.cmd run prod
```

执行后会依次完成 webpack 生产模式打包和 build.js 静态资源复制，最终在仓库根目录生成可用的 `extension/` 文件夹。

将 `extension/` 文件夹通过 Chrome 的"加载已解压的扩展程序"导入即可使用。

### 3.3 构建流程

1. **Webpack**（`webpack.config.js`）：
   - 入口：`src/index.js`
   - 输出：`../extension/content.js`（即仓库根目录的 `extension/content.js`）
   - 处理 JS/JSX（babel-loader）、CSS（style-loader + css-loader）、图片资源（asset/resource）
   - 使用 `dotenv-webpack` 注入 `.env` 中的环境变量

2. **build.js**（静态资源复制脚本）：
   - 从 `public/` 复制 `manifest.json`、`background.js` 到 `../extension/`
   - 从 `public/icons/` 复制整个文件夹到 `../extension/icons/`

### 3.4 编译输出路径

**所有产物统一输出到仓库根目录的 `extension/` 文件夹**，该文件夹即为 Chrome 加载的扩展目录：

| 文件 | 来源 | 生成方式 |
|---|---|---|
| `extension/content.js` | `src/index.js`（整个 React 应用） | webpack 打包 |
| `extension/manifest.json` | `public/manifest.json` | build.js 复制 |
| `extension/background.js` | `public/background.js` | build.js 复制 |
| `extension/icons/*` | `public/icons/*` | build.js 复制 |

---

## 4. Chrome 扩展架构

### 4.1 Manifest V3 配置（`public/manifest.json`）

- **content_scripts**：在 `youtube.com/*` 页面注入 `content.js`
- **background.service_worker**：`background.js` 作为 Service Worker 运行
- **permissions**：`tabs`, `storage`
- **host_permissions**：`youtube.com`, `bilibili.com`, `dm-kks.com`

### 4.2 三层运行架构

```
┌─────────────────────────────────────────────────────┐
│  Background (Service Worker)                        │
│  public/background.js                               │
│  - 监听 tab 更新，发送 videoId 给 content script    │
│  - 代理所有跨域请求（Bilibili API、缩略图下载等）   │
│  - 消息类型：SEARCH / GET_VIDEO_DANMAKU /           │
│    DOWNLOAD_DANMAKU / GET_THUMBNAIL /                │
│    UPDATE_BEST_MATCH / FETCH_GENERAL                 │
└──────────────────────┬──────────────────────────────┘
                       │ chrome.runtime.sendMessage
┌──────────────────────▼──────────────────────────────┐
│  Content Script (注入 YouTube 页面)                  │
│  src/index.js → 打包为 extension/content.js          │
│  - 在 YouTube 侧边栏注入 React 应用                 │
│  - 在视频播放器上方覆盖弹幕层                       │
│  - 监听 YouTube SPA 页面跳转事件                    │
└─────────────────────────────────────────────────────┘
```

---

## 5. 源码文件职责详解

### 5.1 入口与顶层

| 文件 | 职责 |
|---|---|
| `src/index.js` | **应用入口**。在 YouTube 页面创建 `#bilitube-root` 容器，插入到侧边栏 `#secondary-inner`；包裹 ThemeProvider / LanguageProvider / AccessTokenProvider；监听 YouTube SPA 导航事件触发重新渲染；调用 `DanmakuHelper()` 初始化弹幕引擎 |
| `src/App.js` | **主面板组件**。搜索栏 + 最佳匹配列表 + 可能匹配列表 + 词典编辑器（可拖拽浮窗）+ 视频详情 Modal；自动从后端 API 获取匹配视频，从 Bilibili 搜索可能匹配；面板展开/折叠逻辑（高度 42px ↔ 600px） |
| `src/AccessTokenContext.js` | React Context，管理用户认证 accessToken 的全局状态 |

### 5.2 弹幕引擎 (`src/danmaku/`)

| 文件 | 职责 |
|---|---|
| `DanmakuHelper.js` | **弹幕 DOM 注入调度器**。监听 background 发来的 `youtubeid` 消息；在 YouTube 视频播放器上方创建弹幕覆盖层（`#danmaku-container`）；挂载 `<Danmaku />` React 组件；处理页面跳转时的重置逻辑 |
| `Danmaku.js` | **弹幕渲染核心**（React Class 组件）。管理 CommentManager 和 CommentProvider 生命周期；监听视频 play/pause/seeking/timeupdate 事件同步弹幕时间轴；处理弹幕源加载（`addDanmakuSource`）；响应设置变更（透明度/字号/速度/数量）；处理播放器尺寸变化时的弹幕画布缩放；暴露全局方法 `window.resetDanmakus` / `window.addDanmakuSource` / `window.toggleDanmakuVisibility` |
| `CommentCoreLibrary.js` | 第三方弹幕渲染库（[CommentCoreLibrary](https://github.com/jabbany/CommentCoreLibrary)），MIT 协议。提供 `CommentManager`（弹幕管理器）、`CommentProvider`（弹幕数据提供器）、`BilibiliFormat`（B站弹幕 XML 解析器）等核心类。约 2500 行，不建议修改 |
| `ccl-base.css` | CommentCoreLibrary 的基础样式，弹幕容器和弹幕元素的 CSS |

### 5.3 UI 组件 (`src/content/`)

| 文件 | 职责 |
|---|---|
| `searchBar.js` | 搜索栏组件（MUI Paper + InputBase），支持回车和点击搜索 |
| `VideoBox.js` | 视频卡片组件，展示缩略图（通过 background 代理下载）、标题、作者、弹幕数、时长 |
| `Modal.js` | 视频详情弹窗，显示大图 + 标题，提供"加载弹幕"和"在 B 站打开"两个按钮 |
| `UserInfo.js` | 用户信息组件（含 WebMenu 子组件）。显示菜单（网站/文档/关于/GitHub/赞助）、用户头像或登录按钮。通过 API 获取用户登录状态 |
| `DanmakuPanel.js` | **弹幕设置面板**（React 函数组件版本）。注入到 YouTube 播放器右下角控制栏，提供弹幕数量/透明度/字号/速度滑块 + 时间偏移调整。通过 `appendDanmakuControl()` 导出挂载逻辑 |
| `App.css` | 主面板及各 UI 组件的样式 |
| `DanmakuPanel.css` | 弹幕设置面板样式 |
| `User.css` | 用户信息区域样式 |
| `index.css` | 全局基础样式 |

### 5.4 国际化 (`src/i18n/`)

| 文件 | 职责 |
|---|---|
| `i18n.js` | i18next 初始化配置，自动检测浏览器语言（中文 → `zh`，其他 → `en`） |
| `LanguageContext.js` | React Context，提供语言切换功能 |
| `ENtranslation.json` | 英文翻译资源 |
| `ZHtranslation.json` | 中文翻译资源 |

### 5.5 Background Script (`public/background.js`)

独立运行的 Service Worker，**不经过 webpack 打包**，直接复制到 `extension/`。

消息处理类型：

| 消息类型 | 功能 |
|---|---|
| `youtubeid`（tab 更新时主动发送） | 通知 content script 当前视频 ID 和用户语言 |
| `GET_THUMBNAIL` | 代理下载视频缩略图（绕过跨域限制），返回 base64 |
| `SEARCH` | 调用 Bilibili 搜索 API 搜索视频 |
| `GET_VIDEO_DANMAKU` | 根据 bvid 获取视频 cid（弹幕 ID） |
| `DOWNLOAD_DANMAKU` | 下载弹幕 XML 文件，返回 base64 |
| `UPDATE_BEST_MATCH` | 搜索并返回最佳匹配视频信息 |
| `FETCH_GENERAL` | 通用 fetch 代理（用于后端 API 调用） |

---

## 6. 环境变量

配置在 `bilitube/.env`，通过 `dotenv-webpack` 在编译时注入：

| 变量名 | 用途 | 默认值 |
|---|---|---|
| `REACT_APP_API_WEB_URL` | 官网前端地址 | `https://dm-kks.com` |
| `REACT_APP_API_BASE_URL` | 后端 API 地址 | `https://api.dm-kks.com` |

在代码中通过 `process.env.REACT_APP_API_BASE_URL` 访问。

---

## 7. 数据流概览

```
用户打开 YouTube 视频页面
        │
        ▼
[background.js] 监听 tabs.onUpdated → 发送 youtubeid 消息
        │
        ▼
[content.js / index.js] 
  ├── 注入侧边栏面板 → <App /> 组件渲染
  │     ├── 自动请求后端 API 获取最佳匹配视频列表
  │     ├── 自动搜索 Bilibili 获取可能匹配视频列表
  │     └── 用户选择视频 → loadDanmakuByVideo()
  │           ├── 通过 background 获取 cid
  │           ├── 通过 background 下载弹幕 XML
  │           └── 调用 window.addDanmakuSource() 加载弹幕
  │
  └── 注入弹幕覆盖层 → DanmakuHelper → <Danmaku /> 组件
        ├── CommentCoreLibrary 渲染弹幕
        ├── 监听视频播放状态同步弹幕时间
        └── 响应设置变更（DanmakuPanel 通过 chrome.storage 传递）
```

---

## 8. 关键全局方法

以下方法挂载在 `window` 对象上，供不同模块间通信：

| 方法 | 定义位置 | 用途 |
|---|---|---|
| `window.addDanmakuSource(url)` | `Danmaku.js` | 加载弹幕 XML 源到弹幕引擎 |
| `window.resetDanmakus()` | `Danmaku.js` | 清空并重新初始化弹幕引擎 |
| `window.toggleDanmakuVisibility()` | `Danmaku.js` | 切换弹幕显示/隐藏 |

---

## 9. 存储使用（chrome.storage.sync）

| Key | 用途 | 位置 |
|---|---|---|
| `MainPanel` | 主面板展开/折叠状态（boolean） | `App.js`, `index.js` |
| `danmakuSettings` | 弹幕设置（数量/透明度/字号/速度） | `DanmakuPanel.js`, `Danmaku.js` |
| `customKpopDict` | 用户自定义词典映射列表 | `App.js` |

---

## 10. 常见维护场景

### 修改 UI 样式
→ 编辑 `src/content/` 下的 CSS 文件或组件内联样式

### 修改弹幕渲染逻辑
→ 编辑 `src/danmaku/Danmaku.js`，不要修改 `CommentCoreLibrary.js`

### 添加新的 API 请求
→ 在 `public/background.js` 中添加新的消息类型处理，在 content script 中通过 `chrome.runtime.sendMessage` 调用

### 修改匹配/搜索算法
→ 编辑 `src/App.js` 中的 `extractFeatureString()` 和 `handleSearchTrigger()` / `refreshMatchedVideos()`

### 添加新语言
→ 在 `src/i18n/` 下新建翻译 JSON 文件，在 `i18n.js` 的 `resources` 中注册

### 修改扩展权限或匹配规则
→ 编辑 `bilitube/public/manifest.json`，重新构建后自动复制到 `extension/`

---

## 11. 注意事项

1. **编译必须在 `bilitube/` 目录下执行**（`cd bilitube` 然后 `npm.cmd run prod`）
2. **`extension/` 目录不要手动修改**，它的内容由编译流程自动生成
3. `CommentCoreLibrary.js` 是第三方库的本地副本，约 2500 行，不建议修改
4. 图片资源通过 webpack 的 `asset/resource` 处理，输出文件名格式为 `[name][hash:8][ext]`
5. 所有跨域请求（Bilibili API、缩略图等）必须通过 background script 代理，content script 受 CORS 限制
