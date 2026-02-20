# Panel Combination PRD - 统一搜索面板设计

## 概述

将概念确认面板（Concept View）整合到搜索面板（Search View）中，通过可折叠的 section 实现。简化 UI 结构，减少空间占用，提升用户体验。

---

## 核心设计思想

### 统一交互
- **单一入口**：所有功能集中在搜索面板
- **可折叠设计**：概念 section 默认折叠，减少视觉干扰
- **条件显示**：仅在有待确认概念或批量处理时才显示 section，空闲时完全隐藏
- **实时预览**：折叠时显示进度，展开后显示详细内容
- **渐进式操作**：用户主动展开后才显示确认按钮

### 状态管理
- **隐藏状态**：无待确认概念且不在批量处理时，完全隐藏 section
- **折叠状态**：仅显示概念计数和进度条
- **展开状态**：显示完整概念列表和操作按钮
- **自动展开**：批量提取开始时自动展开，结束后保持展开
- **自动显示**：提取概念或开始批量处理时自动显示 section

---

## UI/UX 设计

### 整体布局

```
┌──────────────────────────────────────────┐
│ Search View                               │
├──────────────────────────────────────────┤
│ [搜索框..................] [📄] [📚] [🔍] │
│   ← 搜索框            ← 当前  ← 批量    │
├──────────────────────────────────────────┤
│ 💡 概念确认 ▼   [5个概念 • 2个文件]       │  ← 默认折叠状态
├──────────────────────────────────────────┤
│ 💭 相关笔记                                │  ← 搜索结果
│ • Docker入门 (92%)                        │
└──────────────────────────────────────────┘
```

### 折叠状态

**场景 1：空闲状态（无待确认概念）**
```
┌──────────────────────────────────────────┐
│ (概念 section 完全隐藏）                  │  ← 不显示 section
├──────────────────────────────────────────┤
│ 💭 相关笔记                                │
```
**说明**：当 `extractedConcepts.length === 0` 且 `!isBatchProcessing` 时，完全隐藏概念 section

**场景 2：有待确认概念**
```
┌──────────────────────────────────────────┐
│ 💡 概念确认 ▼   [5个概念 • 2个文件]       │  ← 显示计数徽章
├──────────────────────────────────────────┤
│ 💭 相关笔记                                │
```

**场景 3：批量提取中（折叠状态）**
```
┌──────────────────────────────────────────┐
│ 💡 概念确认 ▼                             │
│ ⏳ 正在批量提取... (3/5文件 • 12个概念)   │  ← 仅显示进度
│ ████████████░░░░  60%                     │
├──────────────────────────────────────────┤
│ 💭 相关笔记                                │
```

### 展开状态

**场景 1：待确认概念**
```
┌──────────────────────────────────────────┐
│ 💡 概念确认 ▲   [5个概念 • 2个文件]       │
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │ [✓ 全选] [✗ 清空]                    │ │
│ │ [✓ 应用 (5)]                         │ │  ← 展开后显示
│ └──────────────────────────────────────┘ │
│ │ 📄 Docker入门 (3个概念)               │ │
│ │   ☑ [[容器启动]] 95%  [✓] [✗]        │ │
│ │   ☑ [[镜像构建]] 87%  [✓] [✗]        │ │
│ │   ☑ [[Docker Compose]] 82%  [✓] [✗]  │ │
│ │ 📄 K8s笔记 (2个概念)                  │ │
│ │   ☑ [[Pod部署]] 88%  [✓] [✗]         │ │
│ │   ☑ [[Service配置]] 79%  [✓] [✗]     │ │
├──────────────────────────────────────────┤
│ 💭 相关笔记                                │
```

**场景 2：批量提取中（展开状态）**
```
┌──────────────────────────────────────────┐
│ 💡 概念确认 ▲                             │
│ ⏳ 正在批量提取... (3/5文件 • 12个概念)   │  ← 仍然显示进度
│ ████████████░░░░  60%                     │
├──────────────────────────────────────────┤
│ ┌──────────────────────────────────────┐ │
│ │ [✓ 全选] [✗ 清空]                    │ │
│ │ [✓ 应用 (12)]                        │ │  ← 可实时操作
│ └──────────────────────────────────────┘ │
│ │ 📄 Docker入门 (3个概念)               │ │
│ │   ☑ [[容器启动]] 95%  [✓] [✗]        │ │  ← 实时显示
│ │   ☑ [[镜像构建]] 87%  [✓] [✗]        │ │
│ │   ☑ [[Docker Compose]] 82%  [✓] [✗]  │ │
│ │ 📄 K8s笔记 (2个概念)                  │ │
│ │   ☑ [[Pod部署]] 88%  [✓] [✗]         │ │
│ │   ☑ [[Service配置]] 79%  [✓] [✗]     │ │
│ │ 📄 Linux笔记 (正在提取...)            │ │  ← 显示加载状态
│ │   ⏳ 正在提取概念...                  │ │
├──────────────────────────────────────────┤
│ 💭 相关笔记                                │
```

### 按钮布局

**搜索框按钮组**：
```
┌──────────────────────────────────────────┐
│ [搜索框..................] [📄] [📚] [🔍] │
│   搜索框               当前  批量  搜索  │
└──────────────────────────────────────────┘
```

**功能说明**：
- `📄` - 提取当前文件的概念（新增）
- `📚` - 批量提取所有文件的概念（现有）
- `🔍` - 执行搜索（现有）

---

## 技术实现

### 组件架构

```
Sidebar (主组件)
├── SearchBox (搜索框)
│   ├── Input (输入框)
│   ├── CurrentFileButton (📄 新增)
│   ├── BatchButton (📚)
│   └── SearchButton (🔍)
├── ConceptSection (可折叠概念区域 - 新增，条件渲染)
│   ├── 显示条件：extractedConcepts.length > 0 || isBatchProcessing
│   ├── Header (折叠头部)
│   │   ├── Title ("💡 概念确认")
│   │   ├── ToggleButton (▼/▲)
│   │   └── Badge ([X个概念 • Y个文件])
│   ├── ProgressBar (进度条)
│   └── ConceptList (概念列表)
│       ├── ActionButtons (全选/清空/应用)
│       └── FileGroups (文件分组)
│           └── ConceptItems (概念项)
└── ResultList (搜索结果)
    └── SmartCards (结果卡片)
```

### 状态管理

```typescript
// Sidebar.tsx
interface SidebarState {
  // 搜索状态
  searchQuery: string;
  searchMode: "ambient" | "search";
  searchResults: SearchResult[];
  ambientResults: SearchResult[];
  isLoading: boolean;

  // 概念状态（新增）
  isConceptExpanded: boolean;           // 概念 section 是否展开
  extractedConcepts: Array<{             // 待确认概念
    notePath: string;
    noteTitle: string;
    concepts: ExtractedConceptWithMatch[];
  }>;
  selectedConcepts: Set<string>;         // 已选中的概念
  selectedFiles: Set<string>;            // 已选中的文件

  // 批量处理状态（新增）
  isBatchProcessing: boolean;
  batchProgress?: {
    totalFiles: number;
    processedFiles: number;
    totalConcepts: number;
    isProcessing: boolean;
  };

  // 索引状态
  isIndexing: boolean;
}
```

### 事件流程

#### 1. 单个文件提取流程

```
用户点击 📄 按钮
  ↓
触发 handleIndexCurrentFile()
  ↓
调用 main.ts processFileAndDispatch()
  ↓
VectorIndexManager.indexFileComplete()
  ↓
触发 memo-echo:concepts-extracted 事件
  ↓
Sidebar 监听事件，更新 extractedConcepts
  ↓
自动展开概念 section (setConceptExpanded(true))
  ↓
显示概念列表
```

#### 2. 批量提取流程

```
用户点击 📚 按钮
  ↓
触发 handleBatchExtract()
  ↓
调用 main.ts handleAllFilesAssociation()
  ↓
开始批量处理 (isBatchProcessing = true)
  ↓
自动展开概念 section
  ↓
每处理 N 个文件触发 memo-echo:batch-increment
  ↓
Sidebar 实时更新 extractedConcepts 和 batchProgress
  ↓
用户可以边看边确认
  ↓
所有文件处理完成
  ↓
触发 memo-echo:batch-progress (isProcessing: false)
```

#### 3. 概念确认流程

```
用户勾选概念
  ↓
更新 selectedConcepts 和 selectedFiles
  ↓
点击 "应用" 按钮
  ↓
触发 memo-echo:batch-concepts-apply 事件
  ↓
main.ts 处理应用逻辑
  ↓
从 displayedConcepts 中移除已确认的概念
  ↓
如果没有更多概念，折叠 section
```

---

## 需要修改的文件清单

### 删除的文件（1 个）

1. **`src/views/concept-view.ts`** (407 行)
   - 完全删除概念确认视图
   - 所有逻辑迁移到 Sidebar 组件

### 修改的文件（6 个）

#### 1. `src/main.ts` (~ -120 行)

**删除内容**：
- 删除 `ConceptView` 导入 (第 3 行)
- 删除 `conceptView` 属性 (第 33 行)
- 删除概念视图注册 (第 231-241 行)
- 删除概念视图 ribbon 图标 (第 248-251 行)
- 删除概念视图命令 (第 263-269 行)
- 删除 `activateAssociationView()` 方法 (第 352-381 行)
- 删除 `handleCurrentFileAssociation` 和 `handleAllFilesAssociation` 参数传递
- 删除 `onunload()` 中的 concept view detach (第 298 行)

**修改内容**：
- 保留所有事件分发逻辑（核心功能不变）
- 简化 `IndexSearchView` 初始化，移除 `onIndexCurrentFile` 参数

#### 2. `src/core/constants.ts` (~ -2 行)

**删除内容**：
- 删除 `VIEW_TYPE_CONCEPT` 常量 (第 87 行)

#### 3. `src/components/ConceptConfirmPanel.tsx` (~ +100 行)

**重构内容**：
- 添加 `isExpanded` 状态
- 重构 UI 结构为折叠/展开两种状态
- 添加折叠/展开动画
- 添加实时显示逻辑（监听 batch-increment 事件）
- 保留所有现有功能（批量应用、单个应用/拒绝等）

**新增接口**：
```typescript
export interface ConceptSectionProps {
  // 显示状态
  isExpanded: boolean;
  onToggleExpand: () => void;

  // 概念数据
  extractedConcepts: Array<{
    notePath: string;
    noteTitle: string;
    concepts: ExtractedConceptWithMatch[];
  }>;

  // 进度数据
  batchProgress?: {
    totalFiles: number;
    processedFiles: number;
    totalConcepts: number;
    isProcessing: boolean;
  };

  // 回调函数
  onApplyConcepts: (groups: ConceptGroup[]) => Promise<void>;
  onClearConcepts: () => void;
  onRejectConcept: (conceptName: string, notePath: string) => void;
  onApplySingleConcept: (group: ConceptGroup) => Promise<void>;

  // 提取控制
  isBatchProcessing: boolean;
  onStopBatch: () => void;
}
```

#### 4. `src/components/Sidebar.tsx` (~ +80 行)

**新增内容**：
- 在搜索框左侧添加"提取当前文件"按钮
- 导入并使用改造后的 `ConceptConfirmPanel`
- 添加概念相关状态管理：
  - `isConceptExpanded`
  - `extractedConcepts`
  - `selectedConcepts`
  - `selectedFiles`
  - `batchProgress`
  - `isBatchProcessing`
- 添加事件监听器：
  - `memo-echo:concepts-extracted`
  - `memo-echo:batch-increment`
  - `memo-echo:batch-progress`
  - `memo-echo:batch-stop`
- 添加提取控制方法：
  - `handleExtractCurrentFile()`
  - `handleBatchExtract()`
  - `handleStopBatch()`
- 调整布局：搜索框 → 概念 section → 结果列表

#### 5. `src/views/index-search-view.ts` (~ -20 行)

**修改内容**：
- 移除 `onIndexCurrentFile` 回调（现在由 Sidebar 组件处理）
- 简化构造函数参数
- 删除 `handleIndexCurrentFile()` 方法（第 114-116 行）

#### 6. `styles.css` (~ +50 行)

**新增内容**：
- 概念 section 样式
- 折叠/展开动画
- 徽章样式
- 按钮组样式
- 进度条样式
- 调整整体布局间距

### 新增的组件（1 个）

#### `src/components/ConceptSection.tsx` (新建，~200 行)

这是一个新组件，从 `ConceptConfirmPanel` 重构而来，专注于概念确认的可折叠 section。

**核心功能**：
- 折叠/展开状态管理
- 折叠时显示进度条
- 展开时显示完整概念列表
- 实时更新（监听 batch-increment 事件）
- 所有确认操作（批量应用、单个应用、拒绝等）

---

## 实施步骤

### Phase 1: 删除 Concept View（0.5 天）

**步骤**：
1. 备份现有代码（git commit）
2. 删除 `src/views/concept-view.ts`
3. 从 `src/main.ts` 删除 ConceptView 相关代码
4. 从 `src/core/constants.ts` 删除 `VIEW_TYPE_CONCEPT`
5. 运行 TypeScript check
6. 测试构建

**验收标准**：
- 项目可以正常编译
- 搜索视图正常工作
- 概念视图完全移除

### Phase 2: 创建 ConceptSection 组件（1 天）

**步骤**：
1. 创建 `src/components/ConceptSection.tsx`
2. 从 `ConceptConfirmPanel` 复制核心逻辑
3. 添加折叠/展开状态
4. 实现折叠 UI（仅显示进度）
5. 实现展开 UI（显示完整列表）
6. 添加折叠/展开动画
7. 实现实时更新逻辑
8. 保留所有确认功能

**验收标准**：
- 组件可以正常渲染
- 折叠/展开功能正常
- 实时更新正常
- 所有确认操作正常

### Phase 3: 集成到 Sidebar（1 天）

**步骤**：
1. 修改 `src/components/Sidebar.tsx`
2. 在搜索框左侧添加"提取当前文件"按钮
3. 导入 `ConceptSection` 组件
4. 添加概念相关状态管理
5. 添加事件监听器
6. 添加提取控制方法
7. 调整布局
8. 测试端到端流程

**验收标准**：
- 搜索框正常工作
- "提取当前文件"按钮正常
- "批量提取"按钮正常
- 概念 section 正常显示
- 所有交互正常

### Phase 4: 简化 IndexSearchView（0.5 天）

**步骤**：
1. 修改 `src/views/index-search-view.ts`
2. 移除 `onIndexCurrentFile` 回调
3. 简化构造函数参数
4. 更新 `main.ts` 中的初始化代码
5. 测试搜索功能

**验收标准**：
- 搜索功能正常
- 相关笔记显示正常
- 代码简洁清晰

### Phase 5: 样式优化（0.5 天）

**步骤**：
1. 添加概念 section 样式
2. 添加折叠/展开动画
3. 添加徽章样式
4. 添加按钮组样式
5. 添加进度条样式
6. 调整整体布局间距
7. 测试响应式布局

**验收标准**：
- 样式美观统一
- 动画流畅
- 布局合理

### Phase 6: 集成测试（1 天）

**测试场景**：
1. 单个文件提取
   - 点击 📄 按钮
   - 验证概念 section 自动展开
   - 验证概念列表正确显示
   - 验证应用/拒绝功能正常

2. 批量提取（所有文件）
   - 点击 📚 按钮
   - 验证进度条正确显示
   - 验证实时更新功能正常
   - 验证边看边确认功能正常

3. 实时预览（流式显示）
   - 折叠状态：验证只显示进度条
   - 展开状态：验证流式显示概念列表
   - 验证进度信息正确更新

4. 批量应用概念
   - 选中多个概念
   - 点击批量应用
   - 验证概念正确写入 frontmatter
   - 验证应用后从列表移除

5. 单个应用概念
   - 点击单个概念的 ✓ 按钮
   - 验证概念正确写入 frontmatter
   - 验证应用后从列表移除

6. 拒绝概念
   - 点击单个概念的 ✗ 按钮
   - 验证概念从列表移除
   - 验证不影响其他概念

7. 停止批量提取
   - 批量提取进行中
   - 点击 🛑 按钮
   - 验证提取停止
   - 验证已提取的概念仍可确认

8. 搜索功能不受影响
   - 提取概念时进行搜索
   - 验证搜索结果正常显示
   - 验证相关笔记正常切换

9. 相关笔记显示正常
   - 清空搜索框
   - 验证相关笔记显示
   - 验证段落检测功能正常

10. 折叠/展开功能
     - 点击头部切换折叠/展开
     - 验证动画流畅
     - 验证状态正确保存

11. Section 隐藏/显示功能
     - 空闲状态：验证概念 section 完全隐藏
     - 提取概念后：验证 section 自动显示
     - 批量提取后：验证 section 保持显示
     - 所有概念确认/拒绝后：验证 section 自动隐藏
     - 验证隐藏/显示过程流畅，无闪烁

**验收标准**：
- 所有测试场景通过
- 无明显性能问题
- 用户体验良好
- 无内存泄漏

---

## 代码分析

### 一、可以删除的内容

#### 1. 完整删除的文件（1 个）

**`src/views/concept-view.ts` (407 行)**
- 删除原因：概念确认功能将完全整合到 Sidebar 组件中

---

#### 2. 需要删除的代码块

##### 2.1 `src/main.ts` (~ 120 行)

| 行号 | 删除内容 | 原因 |
|------|---------|------|
| 第 3 行 | `import { ConceptView } from "./views/concept-view";` | 不再需要导入 |
| 第 15 行 | `, VIEW_TYPE_CONCEPT` | 不再需要常量 |
| 第 33 行 | `private conceptView: ConceptView \| null = null;` | 不再需要属性 |
| 第 231-241 行 | `this.registerView(VIEW_TYPE_CONCEPT, ...)` | 不再需要注册视图 |
| 第 248-251 行 | Ribbon 图标 "关联建议" | 不再需要单独的面板入口 |
| 第 263-269 行 | 命令 "打开关联建议" | 不再需要命令 |
| 第 298 行 | `this.app.workspace.detachLeavesOfType(VIEW_TYPE_CONCEPT);` | 不再需要清理 |
| 第 352-381 行 | `activateAssociationView()` 整个方法 | 不再需要此方法 |
| 第 386-399 行 | `handleCurrentFileAssociation` 和 `handleAllFilesAssociation` 参数传递 | 改为直接触发事件 |

**需要修改的部分**：

| 行号 | 修改内容 |
|------|---------|
| 第 222-228 行 | 移除 `onIndexCurrentFile` 参数传递给 IndexSearchView |
| 第 236 行 | 移除 `handleCurrentFileAssociation` 参数传递给 ConceptView |

---

##### 2.2 `src/core/constants.ts` (~ 2 行)

| 行号 | 删除内容 |
|------|---------|
| 第 87 行 | `export const VIEW_TYPE_CONCEPT = "concept-view";` |

---

##### 2.3 `src/views/index-search-view.ts` (~ 20 行)

| 行号 | 删除内容 | 原因 |
|------|---------|------|
| 第 17 行 | `private onIndexCurrentFile: () => Promise<void>;` | 不再需要回调 |
| 第 24 行 | `onIndexCurrentFile: () => Promise<void>` 参数 | 不再需要参数 |
| 第 28 行 | `this.onIndexCurrentFile = onIndexCurrentFile;` | 不再需要赋值 |
| 第 65-68 行 | 监听 `memo-echo:index-current-file` 事件 | 不再需要此事件 |
| 第 106-107 行 | 移除事件监听器清理 | 不再需要清理 |
| 第 114-116 行 | `handleIndexCurrentFile()` 方法 | 不再需要方法 |
| 第 85 行 | `onIndexCurrent: this.handleIndexCurrentFile` 传递给 Sidebar | 改为直接触发事件 |

---

##### 2.4 需要删除的事件（从 `src/global.d.ts`）

| 事件名 | 是否删除 | 原因 |
|--------|---------|------|
| `memo-echo:index-current-file` | ✅ 删除 | 改为直接触发提取 |
| `memo-echo:concepts-extracted` | ❌ 保留 | Sidebar 需要监听 |
| `memo-echo:batch-increment` | ❌ 保留 | Sidebar 需要监听 |
| `memo-echo:batch-progress` | ❌ 保留 | Sidebar 需要监听 |
| `memo-echo:batch-stop` | ❌ 保留 | Sidebar 需要监听 |
| `memo-echo:batch-concepts-apply` | ❌ 保留 | Sidebar 需要触发 |
| `memo-echo:single-concept-apply` | ❌ 保留 | Sidebar 需要触发 |
| `memo-echo:batch-stop-request` | ❌ 保留 | Sidebar 需要触发 |
| `memo-echo:ambient-update` | ❌ 保留 | Sidebar 需要监听 |
| `memo-echo:open-file` | ❌ 保留 | Sidebar 需要触发 |

---

### 二、可以复用的内容

#### 1. 完全复用的组件

**✅ `BatchProgressBar` 组件 (ConceptConfirmPanel.tsx: 401-427 行)**

- **复用方式**：直接复制到新组件，无需修改
- **代码位置**：`src/components/ConceptConfirmPanel.tsx` (第 401-427 行)

---

#### 2. 需要调整后复用的组件

**✅ `ConceptListInline` 组件 (ConceptConfirmPanel.tsx: 180-387 行)**

- **复用方式**：移除头部（第 280-304 行），仅保留核心逻辑

**需要删除的部分**：
- 第 280-304 行：`memo-echo-concept-list-header` 部分（移到父组件）
- 第 244-256 行：`handleSelectAll` 和 `handleClear` 方法（移到父组件）

**保留的部分**：
- 文件分组渲染（306-384 行）
- 概念项渲染（324-380 行）
- 选中状态管理（187-199 行）
- 切换逻辑（201-228 行）

---

#### 3. 可以复用的方法

**✅ `deduplicateConceptsByName` 方法 (concept-view.ts: 367-400 行)**

- **复用方式**：移到 `src/utils/concept-utils.ts` 或作为组件的辅助函数
- **代码位置**：`src/views/concept-view.ts` (第 367-400 行)

**方法签名**：
```typescript
private deduplicateConceptsByName(
  concepts: ExtractedConceptWithMatch[],
): ExtractedConceptWithMatch[]
```

**功能**：通过标准化名称（trim + lowercase）去重概念，合并相似概念的 reason

---

#### 4. 可以复用的逻辑

**✅ 事件监听逻辑 (concept-view.ts: 183-246 行)**

- **复用方式**：核心逻辑移到 Sidebar 组件的 `useEffect` 中
- **需要保留的事件处理逻辑**：
  - 监听 `memo-echo:concepts-extracted` (183-203 行)
  - 监听 `memo-echo:batch-increment` (206-232 行)
  - 监听 `memo-echo:batch-stop` (235-245 行)

---

#### 5. 可以复用的状态管理

**✅ 概念选中状态 (ConceptListInline: 187-199 行)**

- **复用方式**：直接复制到新组件

```typescript
const [selected, setSelected] = useState<Set<string>>(new Set());
const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

useEffect(() => {
  const allConcepts = new Set(
    concepts.flatMap((g) => g.concepts.map((c) => c.name)),
  );
  const allFiles = new Set(concepts.map((g) => g.notePath));
  setSelected(allConcepts);
  setSelectedFiles(allFiles);
}, [concepts]);
```

---

#### 6. 可以复用的回调逻辑

**✅ 概念确认回调 (concept-view.ts: 251-342 行)**

- **复用方式**：移到 Sidebar 组件中
- **可用的回调**：
  - `handleConceptsBatchApply` (251-268 行) - 批量应用
  - `handleSingleConceptApply` (273-302 行) - 单个应用
  - `handleConceptsClear` (307-311 行) - 清空
  - `handleRejectConcept` (316-342 行) - 拒绝
  - `handleStopBatch` (347-350 行) - 停止批量

---

### 三、需要重构的内容

#### 1. `ConceptConfirmPanel` → `ConceptSection`

**改造方向**：
- 添加折叠/展开状态
- 重构 UI 为折叠/展开两种模式
- 移除 Header 中的 📄 和 📚 按钮（移到 Sidebar 搜索框）
- 保留所有确认逻辑

**新增内容**：
- `isExpanded` 状态
- 折叠头部（显示计数徽章）
- 展开内容（显示完整列表）
- 折叠/展开动画

---

#### 2. `Sidebar` 组件

**新增内容**：
- 搜索框左侧"提取当前文件"按钮（📄）
- 导入 `ConceptSection` 组件
- 概念相关状态管理
- 事件监听器（4 个）
- 提取控制方法（3 个）

**布局调整**：
```
搜索框 → 概念 section → 结果列表
```

---

#### 3. `IndexSearchView` 简化

**删除内容**：
- `onIndexCurrentFile` 回调
- `handleIndexCurrentFile()` 方法
- 相关事件监听器

**保留内容**：
- `searchService` 传递
- `updateRecommendations()` 方法（段落检测）
- `handleOpenFile()` 方法（打开文件）

---

### 四、代码变更统计

#### 删除统计

| 项目 | 数量 | 代码行数 |
|------|------|---------|
| 删除文件 | 1 | -407 |
| 删除常量 | 1 | -2 |
| main.ts 删除 | - | ~ -120 |
| index-search-view.ts 删除 | - | ~ -20 |
| 删除事件 | 1 | ~ -5 |
| **总计** | | **-554 行** |

#### 复用统计

| 项目 | 数量 | 说明 |
|------|------|------|
| 完全复用组件 | 1 | BatchProgressBar |
| 调整复用组件 | 1 | ConceptListInline (移除头部) |
| 复用方法 | 1 | deduplicateConceptsByName |
| 复用逻辑 | 4 | 事件监听、状态管理、回调逻辑 |

#### 新增统计

| 项目 | 数量 | 代码行数 |
|------|------|---------|
| 新建组件 | 1 | ConceptSection (~200 行) |
| Sidebar 新增 | - | ~ +80 |
| 样式 | - | ~ +50 |
| **总计** | | **~ +330 行** |

#### 净变化

```
净变化 = -554 + 330 = -224 行
```

---

## 代码示例

### ConceptSection 组件

```typescript
// src/components/ConceptSection.tsx
import React, { useState, useEffect } from "react";
import { ExtractedConceptWithMatch } from "@core/types/concept";

export interface ConceptSectionProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
  extractedConcepts: Array<{
    notePath: string;
    noteTitle: string;
    concepts: ExtractedConceptWithMatch[];
  }>;
  batchProgress?: {
    totalFiles: number;
    processedFiles: number;
    totalConcepts: number;
    isProcessing: boolean;
  };
  onApplyConcepts: (groups: ConceptGroup[]) => Promise<void>;
  onClearConcepts: () => void;
  onRejectConcept: (conceptName: string, notePath: string) => void;
  onApplySingleConcept: (group: ConceptGroup) => Promise<void>;
  isBatchProcessing: boolean;
  onStopBatch: () => void;
}

export const ConceptSection: React.FC<ConceptSectionProps> = ({
  isExpanded,
  onToggleExpand,
  extractedConcepts,
  batchProgress,
  onApplyConcepts,
  onClearConcepts,
  onRejectConcept,
  onApplySingleConcept,
  isBatchProcessing,
  onStopBatch,
}) => {
  const totalConcepts = extractedConcepts.reduce(
    (sum, g) => sum + g.concepts.length,
    0,
  );

  return (
    <div className="memo-echo-concept-section">
      {/* 折叠/展开头部 */}
      <div
        className="memo-echo-concept-header"
        onClick={onToggleExpand}
      >
        <span>💡 概念确认</span>
        <span className="memo-echo-concept-toggle">
          {isExpanded ? "▲" : "▼"}
        </span>
        {totalConcepts > 0 && !batchProgress?.isProcessing && (
          <span className="memo-echo-concept-badge">
            {totalConcepts}个概念 • {extractedConcepts.length}个文件
          </span>
        )}
      </div>

      {/* 折叠状态：仅显示进度 */}
      {!isExpanded && batchProgress?.isProcessing && (
        <div className="memo-echo-collapsed-progress">
          <BatchProgressBar progress={batchProgress} />
        </div>
      )}

      {/* 展开状态：显示完整内容 */}
      {isExpanded && (
        <div className="memo-echo-concept-content">
          {/* 进度条（仍然显示） */}
          {batchProgress?.isProcessing && (
            <BatchProgressBar progress={batchProgress} />
          )}

          {/* 概念列表 */}
          {extractedConcepts.length > 0 && (
            <ConceptListInline
              concepts={extractedConcepts}
              onApply={onApplyConcepts}
              onClear={onClearConcepts}
              onApplySingle={onApplySingleConcept}
              onRejectSingle={onRejectConcept}
              onStopBatch={onStopBatch}
              isBatchProcessing={isBatchProcessing}
            />
          )}

          {/* 停止批量按钮 */}
          {isBatchProcessing && (
            <button
              className="memo-echo-stop-btn"
              onClick={onStopBatch}
            >
              🛑 停止批量提取
            </button>
          )}
        </div>
      )}
    </div>
  );
};
```

### Sidebar 组件集成

```typescript
// src/components/Sidebar.tsx
import { ConceptSection } from "./ConceptSection";

export const Sidebar: React.FC<SidebarProps> = ({
  searchService,
  initialMode = "ambient",
}: SidebarProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"ambient" | "search">(initialMode);

  // 概念状态
  const [isConceptExpanded, setIsConceptExpanded] = useState(false);
  const [extractedConcepts, setExtractedConcepts] = useState<ExtractedConcept[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress>();

  // 监听概念提取事件
  useEffect(() => {
    const handleConceptsExtracted = (event: CustomEvent) => {
      const { note, concepts } = event.detail;
      setExtractedConcepts([{
        notePath: note.path,
        noteTitle: note.title,
        concepts: deduplicateConcepts(concepts),
      }]);
      setIsConceptExpanded(true); // 自动展开
    };

    const handleBatchIncrement = (event: CustomEvent) => {
      const { batch, totalFiles, processedFiles, totalConcepts } = event.detail;
      setExtractedConcepts(batch.map(...));
      setBatchProgress({
        totalFiles,
        processedFiles,
        totalConcepts,
        isProcessing: processedFiles < totalFiles,
      });
      setIsConceptExpanded(true); // 自动展开
    };

    const handleBatchProgress = (event: CustomEvent) => {
      const { isProcessing } = event.detail;
      setBatchProgress(prev => ({ ...prev, isProcessing }));
    };

    window.addEventListener("memo-echo:concepts-extracted", handleConceptsExtracted);
    window.addEventListener("memo-echo:batch-increment", handleBatchIncrement);
    window.addEventListener("memo-echo:batch-progress", handleBatchProgress);

    return () => {
      window.removeEventListener("memo-echo:concepts-extracted", handleConceptsExtracted);
      window.removeEventListener("memo-echo:batch-increment", handleBatchIncrement);
      window.removeEventListener("memo-echo:batch-progress", handleBatchProgress);
    };
  }, []);

  const handleExtractCurrentFile = async () => {
    setIsBatchProcessing(true);
    try {
      window.dispatchEvent(new CustomEvent("memo-echo:concepts-extract-current"));
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleBatchExtract = async () => {
    if (isBatchProcessing) {
      window.dispatchEvent(new CustomEvent("memo-echo:batch-stop-request"));
      return;
    }
    setIsBatchProcessing(true);
    try {
      window.dispatchEvent(new CustomEvent("memo-echo:batch-extract-all"));
    } finally {
      setIsBatchProcessing(false);
    }
  };

  return (
    <div className="memo-echo-sidebar">
      {/* 搜索框 + 按钮组 */}
      <div className="memo-echo-search-box">
        <input
          type="text"
          placeholder="搜索你的笔记..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          onClick={handleExtractCurrentFile}
          className="memo-echo-icon-btn"
          title="提取当前文件的概念"
        >
          📄
        </button>
        <button
          onClick={handleBatchExtract}
          className="memo-echo-icon-btn"
          title={isBatchProcessing ? "停止批量提取" : "批量提取所有文件的概念"}
        >
          {isBatchProcessing ? "🛑" : "📚"}
        </button>
        <button
          onClick={handleSearchButtonClick}
          className="memo-echo-search-btn"
          disabled={isLoading}
          title="搜索 (Enter)"
        >
          🔍
        </button>
      </div>

      {/* 概念 section - 条件渲染 */}
      {(extractedConcepts.length > 0 || isBatchProcessing) && (
        <ConceptSection
          isExpanded={isConceptExpanded}
          onToggleExpand={() => setIsConceptExpanded(!isConceptExpanded)}
          extractedConcepts={extractedConcepts}
          batchProgress={batchProgress}
          onApplyConcepts={handleApplyConcepts}
          onClearConcepts={handleClearConcepts}
          onRejectConcept={handleRejectConcept}
          onApplySingleConcept={handleApplySingleConcept}
          isBatchProcessing={isBatchProcessing}
          onStopBatch={handleStopBatch}
        />
      )}

      {/* 搜索结果 */}
      <div className="memo-echo-results-container">
        {searchMode === "ambient" && (
          <div className="memo-echo-ambient-view">
            <h3>💭 相关笔记</h3>
            <ResultList results={ambientResults} />
          </div>
        )}
        {searchMode === "search" && (
          <div className="memo-echo-search-view">
            <h3>🔍 搜索结果</h3>
            <ResultList results={searchResults} />
          </div>
        )}
      </div>
    </div>
  );
};
```

---

## 样式规范

### CSS 变量

```css
/* 概念 section 样式 */
.memo-echo-concept-section {
  margin-bottom: 16px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 6px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.memo-echo-concept-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background-color: var(--background-secondary);
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s;
}

.memo-echo-concept-header:hover {
  background-color: var(--background-modifier-hover);
}

.memo-echo-concept-toggle {
  font-size: 12px;
  color: var(--text-muted);
  transition: transform 0.2s;
}

.memo-echo-concept-badge {
  font-size: 11px;
  padding: 2px 6px;
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
  border-radius: 10px;
  font-weight: 500;
}

/* 折叠状态进度 */
.memo-echo-collapsed-progress {
  padding: 8px 12px;
  border-top: 1px solid var(--background-modifier-border);
}

/* 展开状态内容 */
.memo-echo-concept-content {
  max-height: 500px;
  overflow-y: auto;
  transition: max-height 0.3s ease, opacity 0.3s ease;
}

/* 按钮组样式 */
.memo-echo-concept-actions {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--background-modifier-border);
}

/* 停止批量按钮 */
.memo-echo-stop-btn {
  width: 100%;
  padding: 8px 12px;
  margin: 8px 12px;
  background-color: var(--background-modifier-error);
  color: var(--text-error);
  border: 1px solid var(--background-modifier-error);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.memo-echo-stop-btn:hover {
  background-color: var(--text-error);
  color: var(--background-primary);
}
```

---

## 风险评估

### 技术风险

1. **状态管理复杂度**
   - 风险：一个组件管理多个状态可能难以维护
   - 解决方案：清晰的状态分类和命名，使用 TypeScript 类型约束

2. **事件监听器泄漏**
   - 风险：事件监听器未正确清理导致内存泄漏
   - 解决方案：使用 `useEffect` 的 cleanup 函数确保清理

3. **性能问题**
   - 风险：批量提取时频繁更新 DOM 导致性能问题
   - 解决方案：使用 React.memo 优化子组件，批量更新状态

### 用户体验风险

1. **视觉干扰**
   - 风险：概念 section 展开后占用过多空间
   - 解决方案：默认折叠，自动展开仅在提取时触发

2. **操作复杂性**
   - 风险：折叠/展开逻辑复杂，用户困惑
   - 解决方案：清晰的视觉指示（▼/▲），一致的交互模式

3. **实时预览干扰**
   - 风险：实时更新概念列表影响用户操作
   - 解决方案：保持用户已确认的概念不消失，仅追加新概念

---

## 向后兼容性

### 数据兼容性
- 无数据迁移需求
- 所有现有事件保持不变
- main.ts 的事件分发逻辑保持不变

### API 兼容性
- 删除 `VIEW_TYPE_CONCEPT` 常量（仅内部使用）
- 删除 `ConceptView` 类（仅内部使用）
- 所有用户 API 保持不变

---

## 总结

这个 Panel Combination 方案具有以下优势：

✅ **简化架构** - 从两个面板减少到一个面板
✅ **减少代码** - 净减少 ~319 行代码
✅ **提升体验** - 统一交互，减少切换
✅ **降低干扰** - 可折叠设计 + 条件显示，空闲时完全隐藏
✅ **实时预览** - 折叠时显示进度，展开后显示详情
✅ **渐进式操作** - 用户主动展开后才显示确认按钮
✅ **智能显示** - 仅在需要时显示 section，减少视觉干扰

**实施时间**：约 **4.5 天**

**代码变更**：
- 删除：1 个文件（~407 行）
- 修改：6 个文件（~-30 行）
- 新增：1 个组件（~200 行）
- 样式：+50 行
- **净变化**：-187 行
