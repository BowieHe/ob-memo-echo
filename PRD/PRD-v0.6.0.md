# Obsidian Memo Echo - PRD v0.6.0

## 版本信息

- **版本**: 0.6.0
- **代号**: "智能关联" (Smart Associations)
- **状态**: Draft
- **前置版本**: v0.5.0 (图谱增强)
- **核心目标**: 实现AI辅助的跨笔记概念关联，增强知识网络的有机连接

---

## 1. 核心目标

v0.5.0 实现了前端概念注入和Graph View集成。v0.6.0 将：

1. **高质量抽象概念提取**：从技术名词中提取通用抽象概念（如"幂等性"而非"Kafka"）
2. **跨笔记关联发现**：自动发现共享相同抽象概念的笔记对
3. **智能关联建议**：在侧边栏显示AI发现的潜在关联
4. **用户可控操作**：一键接受/忽略关联，快速删除不满意的概念
5. **渐进式体验**：从简单关联开始，为未来学习机制奠定基础

---

## 2. 问题陈述

当前用户在知识管理中的痛点：
1. **手动关联负担重**：需要手动在不同笔记间添加双链才能建立连接
2. **概念提取质量差**：现有AI提取的概念过于泛化（如"技术开发"）或过于具体（如"Kafka"）
3. **跨领域连接缺失**：相同概念在不同主题笔记中难以发现关联（如Kafka笔记中的"幂等性"和订单系统中的"幂等性"）
4. **Graph View利用率低**：由于缺乏有意义的连接，Graph View难以发挥可视化优势

---

## 3. 技术设计

### 3.1 概念提取改进

```typescript
// 改进的ConceptExtractor配置
interface ConceptExtractionConfig {
    provider: 'ollama' | 'openai' | 'rules';
    focusOnAbstractConcepts: boolean; // 新增：专注于抽象概念
    minConfidence: number;           // 新增：最小置信度阈值
    excludeGenericConcepts: string[]; // 新增：排除过于通用的概念
}

// 改进的Prompt设计
private buildPrompt(content: string): string {
    return `提取这段技术内容中的**抽象概念和设计模式**，忽略具体技术名称。

规则：
- 提取3-5个核心抽象概念（如"幂等性"、"事件溯源"、"最终一致性"）
- 避免具体技术名词（如Kafka、Redis、MySQL）
- 优先提取计算机科学、软件工程通用概念
- 概念应为名词或名词短语，1-3个单词

内容：${content}

返回JSON格式：{"concepts": ["概念1", "概念2"]}`;
}
```

### 3.2 关联发现引擎

```typescript
interface NoteAssociation {
    sourceNoteId: string;
    targetNoteId: string;
    sharedConcepts: string[];      // 共享的抽象概念列表
    confidence: number;            // 关联置信度
    vectorSimilarity?: number;     // 向量相似度（可选）
}

class SimpleAssociationEngine {
    // 发现基于共享抽象概念的笔记关联
    async discoverAssociations(): Promise<NoteAssociation[]> {
        // 1. 获取所有笔记的概念映射 {noteId → concepts[]}
        // 2. 找出共享至少1个抽象概念的笔记对
        // 3. 按共享概念数量、概念置信度排序
        // 4. 返回前N个高质量关联
    }

    // 排序规则（简化版，无需复杂学习）
    private sortAssociations(pairs: NoteAssociation[]): NoteAssociation[] {
        return pairs.sort((a, b) => {
            // 1. 共享概念数量（降序）
            const conceptCountDiff = b.sharedConcepts.length - a.sharedConcepts.length;
            if (conceptCountDiff !== 0) return conceptCountDiff;

            // 2. 平均概念置信度（降序）
            const avgConfidenceA = this.calcAvgConfidence(a);
            const avgConfidenceB = this.calcAvgConfidence(b);
            return avgConfidenceB - avgConfidenceA;
        });
    }
}
```

### 3.3 侧边栏关联面板

**视图类型**: `VIEW_TYPE_ASSOCIATION_PANEL`

**React组件结构**:
```tsx
const AssociationPanel: React.FC = () => {
    // 状态管理
    const [associations, setAssociations] = useState<NoteAssociation[]>([]);
    const [loading, setLoading] = useState(false);

    // 操作函数
    const acceptAssociation = (association: NoteAssociation) => {
        // 在双方笔记中注入概念wikilink
    };

    const ignoreAssociation = (association: NoteAssociation) => {
        // 标记为忽略，暂时隐藏
    };

    const deleteConcept = (association: NoteAssociation, concept: string) => {
        // 从关联中删除特定概念
    };

    return (
        <div className="memo-echo-association-panel">
            <h3>关联建议面板</h3>
            {associations.map(assoc => (
                <AssociationCard
                    key={assoc.sourceNoteId + '-' + assoc.targetNoteId}
                    association={assoc}
                    onAccept={acceptAssociation}
                    onIgnore={ignoreAssociation}
                    onDeleteConcept={deleteConcept}
                />
            ))}
            <div className="bulk-actions">
                <button onClick={acceptAll}>✅ 接受所有建议</button>
                <button onClick={clearRecent}>🗑️ 清除最近添加的概念</button>
            </div>
        </div>
    );
};
```

**UI布局示例**:
```
[关联建议面板]
────────────────
发现 3 个潜在关联：

✓ Kafka架构设计.md ↔ 订单系统设计.md
   共享概念：幂等性、事件驱动
   [接受] [忽略] [×删除概念]

✓ 分布式事务.md ↔ 微服务架构.md
   共享概念：数据一致性、容错性
   [接受] [忽略] [×删除概念]

✓ Rust所有权.md ↔ 内存管理模式.md
   共享概念：所有权、生命周期
   [接受] [忽略] [×删除概念]

[操作按钮]
────────────
✅ 接受所有建议
🗑️ 清除最近添加的概念
⚙️ 打开设置页面
```

### 3.4 一键操作功能

**设置页面新增功能**:
```yaml
# 关联管理设置
- [x] 自动扫描关联（默认开启）
- [ ] 仅显示高置信度关联（>0.8）
- [ ] 自动接受高质量关联（>0.9）
1
# 概念过滤
排除以下通用概念：
[技术开发, 总结, 概述, 简介]

# 一键操作按钮
[一键清空所有 me_concepts 字段]
[重新扫描所有笔记关联]
[导出关联统计数据]
```

**快速删除实现**:
```typescript
class FrontmatterService {
    // 清除最近添加的概念（例如最近7天）
    async clearRecentConcepts(days: number = 7): Promise<{ cleared: number }> {
        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        let cleared = 0;

        for (const file of this.app.vault.getMarkdownFiles()) {
            const fields = await this.readMemoEchoFields(file);
            if (fields.me_indexed_at) {
                const indexedAt = new Date(fields.me_indexed_at);
                if (indexedAt > cutoffDate) {
                    await this.clearMemoEchoFields(file);
                    cleared++;
                }
            }
        }

        return { cleared };
    }
}
```

### 3.5 数据流架构

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│  笔记变更   │───>│ 概念提取器   │───>│ 概念映射表   │
└─────────────┘    └──────────────┘    └──────────────┘
                                           │
┌─────────────┐    ┌──────────────┐       │
│  用户操作   │<───│ 关联面板UI   │<──────┘
└─────────────┘    └──────────────┘
         │                  │
         ▼                  ▼
┌──────────────┐    ┌──────────────┐
│ Frontmatter  │    │ 关联发现引擎 │
│   注入器     │    └──────────────┘
└──────────────┘           │
         │                  │
         └──────────────────┘
                 │
                 ▼
        ┌──────────────┐
        │ Graph View   │
        │   可视化     │
        └──────────────┘
```

---

## 4. 功能特性

### 4.1 高质量概念提取
- **抽象概念优先**：专注于提取通用设计模式和原理
- **多层质量过滤**：AI提取 → 置信度过滤 → 通用概念排除
- **多语言支持**：支持中英文概念的混合提取

### 4.2 智能关联发现
- **基于共享概念**：发现共享相同抽象概念的笔记
- **置信度排序**：按共享概念数量和置信度智能排序
- **增量发现**：只在笔记变更时重新计算相关关联

### 4.3 用户友好界面
- **侧边栏集成**：在Obsidian右侧显示关联建议
- **直观操作**：每个关联提供接受/忽略/删除选项
- **批量处理**：支持一键接受所有或清除最近添加

### 4.4 安全可控
- **无自动写入**：默认不自动修改笔记，需用户确认
- **快速回滚**：一键清除最近添加的所有概念
- **配置灵活**：可配置概念过滤和关联阈值

---

## 5. 实现阶段

### Phase 1: 概念提取改进 (v0.6.0-alpha)
1. 改进`ConceptExtractor`的Prompt设计
2. 添加概念质量过滤机制
3. 测试抽象概念提取效果（使用实际笔记验证）

### Phase 2: 关联发现引擎 (v0.6.0-beta)
1. 实现`SimpleAssociationEngine`
2. 构建笔记-概念反向索引
3. 开发关联发现算法和排序逻辑

### Phase 3: 侧边栏UI (v0.6.0-rc1)
1. 创建`AssociationView`侧边栏视图
2. 实现React组件和状态管理
3. 集成接受/忽略/删除操作

### Phase 4: 一键操作功能 (v0.6.0-rc2)
1. 设置页面添加一键操作按钮
2. 实现快速删除最近概念功能
3. 添加关联统计和导出功能

### Phase 5: 测试优化 (v0.6.0)
1. 性能测试（大规模笔记集）
2. 用户体验测试
3. Bug修复和优化

---

## 6. User Stories

### Story 1: 发现跨领域关联
> 作为技术写作者，我写了很多关于不同技术的笔记（Kafka、订单系统、分布式事务），
> 我希望AI能自动发现它们之间的共同概念（如"幂等性"），
> 帮助我看到知识的内在联系。

### Story 2: 高质量概念标签
> 作为知识管理者，我希望AI提取的是有意义的抽象概念（如"事件驱动"、"数据一致性"），
> 而不是泛泛的"技术开发"或过于具体的"Kafka"。

### Story 3: 简单可控的操作
> 作为Obsidian用户，我希望在侧边栏看到清晰的关联建议，
> 并能一键接受或忽略，不满意时能快速删除最近添加的概念。

### Story 4: 无侵入式体验
> 作为隐私敏感用户，我希望AI只在本地分析我的笔记，
> 不自动修改内容，所有修改都需我明确确认。

### Story 5: Graph View增强
> 作为视觉思考者，我希望在Graph View中看到有意义的连接，
> 通过概念节点形成知识网络，而不是零散的笔记孤岛。

---

## 7. 技术约束

### 7.1 Obsidian API限制
- **侧边栏实现**：使用`registerView`和`addView`API
- **前端操作**：使用Obsidian的React支持和事件系统
- **文件修改**：使用`app.fileManager.processFrontMatter()`安全操作frontmatter

### 7.2 性能考虑
- **增量处理**：关联发现只在笔记变更时触发
- **后台计算**：复杂计算在后台进行，不影响UI响应
- **结果缓存**：关联结果缓存避免重复计算

### 7.3 兼容性要求
- **向前兼容**：v0.6.0需要兼容v0.5.0的`me_concepts`格式
- **配置迁移**：现有用户设置需要平滑迁移
- **数据安全**：所有用户数据操作需要备份和回滚机制

### 7.4 依赖管理
- **可选依赖**：LanceDB作为默认向量存储，Qdrant作为可选
- **AI服务**：Ollama本地优先，OpenAI作为云备选
- **包大小**：保持插件包大小合理，避免影响Obsidian启动

---

## 8. 成功指标

### 8.1 技术指标
- **概念提取准确率**：抽象概念提取准确率 > 70%
- **关联发现覆盖率**：能发现 > 80%的人工可识别关联
- **处理性能**：1000个笔记的关联扫描时间 < 30秒

### 8.2 用户体验指标
- **关联接受率**：用户接受AI建议的比例 > 60%
- **手动关联减少**：用户手动创建关联次数减少 > 50%
- **Graph View使用率**：用户使用Graph View频率增加 > 40%

### 8.3 质量指标
- **Bug数量**：严重Bug数 < 5个
- **内存占用**：插件内存占用 < 100MB
- **启动时间**：插件启动时间增加 < 1秒

---

## 9. 未来扩展点

### 9.1 短期扩展 (v0.7.0)
- **多策略关联**：结合向量相似度、时序关系、引用链
- **个性化学习**：基于用户反馈调整关联权重
- **高级过滤**：按概念类型、领域、重要性过滤关联

### 9.2 中期扩展 (v0.8.0)
- **关联图谱视图**：专门的关联可视化界面
- **批量关联管理**：跨笔记的关联批量操作
- **关联质量评估**：自动评估和提升关联质量

### 9.3 长期愿景 (v1.0+)
- **智能知识网络**：完全自动化的知识图谱构建
- **跨库关联**：支持多个知识库之间的关联发现
- **协作关联**：团队知识库的共享概念和关联

---

## 10. 风险与缓解

### 风险1: 概念提取质量不稳定
- **缓解**: 多级后备策略 + 用户可配置过滤器
- **缓解**: 提供概念编辑功能，允许用户修正

### 风险2: 关联建议过多导致信息过载
- **缓解**: 智能阈值过滤 + 分批展示
- **缓解**: 用户可调整显示数量和排序规则

### 风险3: 性能影响大规模笔记库
- **缓解**: 增量计算 + 后台处理 + 结果缓存
- **缓解**: 可配置扫描频率和计算资源限制

### 风险4: 用户隐私顾虑
- **缓解**: 本地优先处理 + 明确的数据使用说明
- **缓解**: 提供完整的数据清除和导出功能

---

**文档状态**: Draft v1.0
**最后更新**: 2026-01-25
**下次评审**: 开发团队完成Phase 1后