# Obsidian 语义搜索插件 - PRD

## 1. 项目概述

本项目是一个纯 TypeScript 实现的 Obsidian 插件，提供基于语义的笔记搜索功能。插件使用 Qdrant 向量数据库存储文档嵌入向量，支持 Ollama、OpenAI 或本地 Transformers.js 生成嵌入。

**核心特性**：

-   🔍 语义搜索：基于内容含义而非关键词的智能搜索
-   📑 智能分块：按 Markdown 标题层级分块，保留上下文
-   🔄 增量同步：只索引新文件和已修改的文件
-   🎨 原生集成：完全集成到 Obsidian 界面，支持主题适配
-   📦 跨平台：纯 TypeScript 实现，无二进制依赖

## 2. 架构设计

### 2.1 技术栈

-   **语言**: TypeScript
-   **框架**: Obsidian Plugin API
-   **构建工具**: esbuild
-   **向量数据库**: Qdrant (Docker 或本地部署)
-   **嵌入服务**:
    -   Ollama (推荐，本地运行)
    -   OpenAI API (云端)
    -   Transformers.js (浏览器内运行，实验性)

### 2.2 核心模块

```
src/
├── main.ts                      # 插件入口
├── search-view.ts               # 搜索界面
├── settings.ts                  # 设置页面
└── services/
    ├── embedding-service.ts     # 嵌入服务抽象层
    ├── vector-store.ts          # Qdrant 客户端
    └── chunker.ts               # Markdown 分块器
```

### 2.3 数据流

```
用户输入查询
    ↓
EmbeddingService 生成查询向量
    ↓
VectorStore 在 Qdrant 中搜索
    ↓
返回相似文档块
    ↓
SearchView 展示结果
```

## 3. MVP (最小可行产品) 功能范围

**本次实现重点:搜索功能**

我们先实现最核心的搜索功能,验证整体架构的可行性。其他功能(如自动索引、推荐等)在后续迭代中添加。

### 3.1 必须实现的功能

#### 3.1.1 搜索视图 (Search View)

-   **位置**: 右侧边栏
-   **组件**:
    -   标题: "🔍 语义搜索"
    -   搜索框: 输入查询内容
    -   状态栏: 显示搜索状态 (搜索中/找到 N 个结果/未找到结果)
    -   结果列表: 展示搜索结果

#### 3.1.2 搜索功能

-   **输入**: 用户在搜索框输入查询文本
-   **防抖**: 500ms 延迟,避免频繁请求
-   **支持回车**: 按 Enter 键立即搜索
-   **调用 API**: 发送 POST 请求到 `http://localhost:37337/api/search`
-   **显示结果**:
    -   文件路径
    -   内容预览 (前 50 个字符)
    -   相似度分数 (百分比显示)
    -   类型图标 (📝 文本 / 🖼️ 图片)
    -   图片预览 (如果是 image 类型)

#### 3.1.3 结果交互

-   **点击跳转**: 点击结果项,在主编辑区打开对应文件
-   **Hover 效果**: 鼠标悬停时高亮显示

#### 3.1.4 服务状态检查与错误处理

-   **启动检查**: 插件加载时自动检查 Rust 服务是否运行
-   **自动启动**: 如果服务未运行,尝试自动启动 Rust 进程
-   **重试机制**: 最多重试 3 次,如果都失败则停止自动重试
-   **手动重试**: 提供"刷新服务"按钮,允许用户手动重试连接
-   **错误提示**: 服务不可用时显示友好提示和重试按钮
-   **状态指示**: 在搜索视图显示服务连接状态 (🟢 已连接 / 🔴 未连接)

### 3.2 暂不实现的功能 (后续版本)

-   ❌ 自动索引 Vault 中的所有笔记
-   ❌ 监听文件变化,增量更新索引
-   ❌ 基于当前文档的智能推荐
-   ❌ 图片上下文提取与索引
-   ❌ 高级过滤选项 (按类型、时间等)
-   ❌ 设置页面 (配置 API 地址等)
-   ❌ Rust 进程管理 (自动启动/关闭)

## 4. 技术方案

### 4.1 技术栈

-   **语言**: TypeScript
-   **框架**: Obsidian Plugin API (无需额外前端框架)
-   **构建工具**: esbuild (快速打包)
-   **HTTP 客户端**: 原生 `fetch` API

### 4.2 项目结构

```
plugin/
├── src/
│   ├── main.ts          # 插件入口,注册视图和命令
│   ├── api-client.ts    # Rust API 客户端封装
│   └── search-view.ts   # 搜索视图组件
├── styles.css           # 插件样式
├── manifest.json        # 插件清单
├── package.json         # 依赖管理
├── tsconfig.json        # TypeScript 配置
└── esbuild.config.mjs   # 构建配置
```

### 4.3 核心模块设计

#### 4.3.1 API Client (`api-client.ts`)

**职责**: 封装与 Rust 后端的所有 HTTP 通信

**接口**:

```typescript
class RustApiClient {
    async health(): Promise<HealthResponse>;
    async search(request: SearchRequest): Promise<SearchResponse>;
    async isAvailable(): Promise<boolean>;
}
```

**数据类型**:

```typescript
interface SearchRequest {
    query: string;
    limit?: number;
    point_type?: "text" | "image";
}

interface SearchResult {
    path: string;
    content: string;
    point_type: "text" | "image";
    score: number;
}

interface SearchResponse {
    success: boolean;
    count: number;
    results: SearchResult[];
}
```

#### 4.3.2 Search View (`search-view.ts`)

**职责**: 渲染搜索界面,处理用户交互

**核心方法**:

-   `onOpen()`: 初始化视图,创建 DOM 元素
-   `performSearch()`: 执行搜索逻辑
-   `displayResults()`: 渲染搜索结果
-   `openFile()`: 打开文件
-   `debounceSearch()`: 防抖处理

**状态管理**:

-   `isSearching`: 是否正在搜索
-   `searchInput`: 搜索框元素引用
-   `resultsContainer`: 结果容器引用

#### 4.3.3 Main Plugin (`main.ts`)

**职责**: 插件生命周期管理

**核心方法**:

-   `onload()`: 注册视图、命令、Ribbon 图标
-   `onunload()`: 清理资源
-   `activateView()`: 打开/显示搜索视图
-   `checkServiceStatus()`: 检查 Rust 服务状态

### 4.4 UI/UX 设计

#### 4.4.1 视图布局

```
┌─────────────────────────────────┐
│  🔍 语义搜索                     │  ← 标题
├─────────────────────────────────┤
│  [输入查询内容...]              │  ← 搜索框
├─────────────────────────────────┤
│  找到 5 个结果                   │  ← 状态栏
├─────────────────────────────────┤
│  📝 rust.md            92.3%    │  ← 结果项
│  ## 特性                        │
│  - 内存安全                      │
│  - 零成本抽象...                 │
├─────────────────────────────────┤
│  📝 programming.md     85.6%    │
│  # Rust 学习笔记                │
│  Rust 是一门系统编程语言...      │
└─────────────────────────────────┘
```

#### 4.4.2 交互流程

1. **用户输入查询** → 触发防抖计时器
2. **500ms 后** → 调用 `performSearch()`
3. **显示"搜索中..."** → 更新状态栏
4. **调用 Rust API** → `POST /api/search`
5. **收到结果** → 渲染结果列表
6. **用户点击结果** → 打开对应文件

#### 4.4.3 样式设计

-   **主题适配**: 使用 Obsidian CSS 变量 (`--background-primary`, `--text-normal` 等)
-   **响应式**: 自适应侧边栏宽度
-   **Hover 效果**: 结果项悬停时高亮并轻微位移
-   **滚动条**: 自定义样式,与 Obsidian 主题一致

## 5. 开发流程

### 5.1 开发环境设置

1. **安装依赖**:

    ```bash
    cd plugin
    npm install
    ```

2. **启动开发模式**:

    ```bash
    npm run dev
    ```

3. **链接到测试 Vault**:

    ```bash
    # 创建符号链接到你的测试 Vault
    ln -s $(pwd) /path/to/test-vault/.obsidian/plugins/obsidian-semantic-search
    ```

4. **启动 Rust 服务**:
    ```bash
    cd ../core
    cargo run --release
    ```

### 5.2 测试流程

#### 5.2.1 手动测试步骤

1. **服务状态测试**:

    - 在 Rust 服务未启动时打开插件 → 应显示错误提示
    - 启动 Rust 服务 → 执行"检查搜索服务状态"命令 → 应显示成功

2. **搜索功能测试**:

    - 打开搜索视图 → 应显示空状态提示
    - 输入查询 → 应在 500ms 后自动搜索
    - 按 Enter → 应立即搜索
    - 查看结果 → 应显示路径、内容、分数

3. **交互测试**:
    - 点击结果 → 应在主编辑区打开文件
    - Hover 结果 → 应显示高亮效果

#### 5.2.2 前置条件

**测试前需要手动索引一些数据**:

```bash
# 索引测试数据
curl -X POST http://localhost:37337/api/index \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/notes/rust.md",
    "content": "# Rust 学习笔记\n\n## 特性\n- 内存安全\n- 零成本抽象\n- 并发安全",
    "point_type": "text"
  }'

curl -X POST http://localhost:37337/api/index \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/notes/programming.md",
    "content": "# 编程语言\n\nRust 是一门现代系统编程语言。",
    "point_type": "text"
  }'
```

## 6. 待讨论的问题

### 6.1 API 地址配置

-   **问题**: 目前硬编码为 `http://localhost:37337`,是否需要可配置?
-   **选项**:
    -   A. 暂时硬编码,后续版本添加设置页面
    -   B. 现在就添加设置页面

### 6.2 错误处理 ✅ 已确认

-   **方案**: 返回服务错误后,不再继续请求
-   **手动重试**: 提供"刷新"按钮,允许用户手动重试
-   **自动启动**: 需要自动启动 Rust 进程
-   **重试限制**: 最多重试 3 次,失败后等待手动重试

### 6.3 结果展示 ✅ 已确认

-   **内容预览长度**: 前 50 个字符
-   **固定长度**: 不需要可配置或自适应

### 6.4 块级定位 ✅ 已确认

-   **需要扩展**: 需要 Rust API 返回行号或块 ID
-   **当前实现**: 先支持文件级跳转
-   **向前兼容**: 设计时考虑未来升级,当 Rust API 返回位置信息时,TypeScript 端能够自动使用
-   **实现策略**:
    -   如果 API 返回包含 `line_number` 或 `block_id`,则跳转到具体位置
    -   如果只有 `path`,则跳转到文件开头
    -   这样后续 Rust 升级后,无需大改 TypeScript 代码

### 6.5 图片预览 ✅ 已确认

-   **需要实现**: 对于 `point_type: "image"` 的结果,需要内嵌图片预览
-   **实现方式**: 在结果项中显示图片缩略图 (最大高度 150px)
-   **加载策略**: 懒加载,避免一次性加载太多图片

## 7. 后续迭代计划

### 7.1 版本 0.2 - 自动索引

-   扫描 Vault 中的所有 Markdown 文件
-   批量索引到 Rust 后端
-   显示索引进度

### 7.2 版本 0.3 - 定期同步索引

-   **不使用文件监听**: 避免频繁监听带来的性能问题
-   **定期同步**: 每 20-30 分钟自动同步一次索引
-   **手动触发**: 提供"立即同步"命令
-   **增量更新**: 只索引修改过的文件,避免全量重建

### 7.3 版本 0.4 - 智能推荐

-   基于当前打开的文档推荐相关内容
-   支持基于光标位置的章节级推荐

### 7.4 版本 0.5 - 高级功能

-   设置页面 (配置 API 地址、搜索参数等)
-   过滤选项 (按类型、时间、文件夹等)
-   搜索历史记录

## 8. 成功标准

MVP 版本成功的标准:

1. ✅ 插件能在 Obsidian 中正常加载
2. ✅ 能检测 Rust 服务状态
3. ✅ 搜索框能正常输入并触发搜索
4. ✅ 搜索结果能正确显示 (路径、内容、分数)
5. ✅ 点击结果能打开对应文件
6. ✅ UI 样式与 Obsidian 主题协调
7. ✅ 无明显性能问题 (搜索响应 < 1s)

## 9. 风险与限制

### 9.1 已知限制

-   **需要手动索引**: MVP 版本不包含自动索引功能
-   **依赖外部服务**: 需要用户手动启动 Rust 服务
-   **无块级定位**: 只能跳转到文件,不能定位到具体段落

### 9.2 潜在风险

-   **跨平台兼容性**: 需要在 Windows/macOS/Linux 上测试
-   **Obsidian 版本兼容**: 需要测试不同 Obsidian 版本

## 10. 开放问题

请帮我确认以下问题:

1. **MVP 功能范围是否合理?** 是否有必须添加或可以删减的功能?
2. **UI 设计是否符合预期?** 搜索框在右侧边栏的布局是否满足需求?
3. **是否需要现在就考虑图片预览?** 还是后续版本再添加?
4. **是否需要支持键盘导航?** (上下键选择结果,Enter 打开)
5. **搜索结果的排序逻辑?** 目前按相似度降序,是否需要其他排序选项?
