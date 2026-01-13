# 🧪 Rust 测试指南

本项目使用 Rust 标准测试框架进行自动化测试。

## 📁 测试文件结构

```
core/
├── src/
│   ├── lib.rs          # 库入口，导出模块
│   ├── main.rs         # 可执行文件入口
│   ├── db.rs           # Qdrant 数据库模块
│   └── embedding.rs    # Ollama Embedding 模块
├── tests/              # 集成测试目录
│   ├── test_ollama.rs       # Ollama 功能测试
│   ├── test_qdrant.rs       # Qdrant 功能测试
│   └── test_integration.rs  # 完整流程测试
└── examples/           # 示例代码（保留用于演示）
```

---

## 🚀 运行测试

### **运行所有测试**

```bash
cd /home/bowie/code/ob-image-vector/core
cargo test
```

### **运行特定测试文件**

```bash
# 只测试 Ollama
cargo test --test test_ollama

# 只测试 Qdrant
cargo test --test test_qdrant

# 只测试集成流程
cargo test --test test_integration
```

### **运行单个测试函数**

```bash
# 测试 Ollama 连接
cargo test --test test_ollama test_ollama_connection

# 测试语义相似度
cargo test --test test_ollama test_semantic_similarity
```

### **显示测试输出（println!）**

默认情况下，测试通过时不显示 `println!` 输出。使用 `--nocapture` 查看：

```bash
cargo test -- --nocapture
```

### **并行 vs 串行运行**

```bash
# 串行运行（避免资源竞争）
cargo test -- --test-threads=1

# 并行运行（默认）
cargo test
```

---

## ✅ 测试清单

### **1. Ollama 测试** (`test_ollama.rs`)

| 测试函数                    | 功能           | 验证内容                    |
| --------------------------- | -------------- | --------------------------- |
| `test_ollama_connection`    | 连接测试       | Ollama 服务是否运行         |
| `test_embedding_generation` | Embedding 生成 | 向量维度是否为 768          |
| `test_semantic_similarity`  | 语义相似度     | 相关文本相似度 > 不相关文本 |
| `test_batch_embedding`      | 批量处理       | 能否连续生成多个向量        |

**运行**:

```bash
cargo test --test test_ollama -- --nocapture
```

**预期输出**:

```
running 4 tests
test test_ollama_connection ... ok
✅ Ollama 服务连接正常

test test_embedding_generation ... ok
✅ Embedding 生成成功，维度: 768

test test_semantic_similarity ... ok
相似度: "埃菲尔铁塔" vs "法国旅游" = 0.823
相似度: "埃菲尔铁塔" vs "猫咪照片" = 0.234
✅ 语义相似度测试通过

test test_batch_embedding ... ok
✅ 批量 Embedding 测试通过

test result: ok. 4 passed; 0 failed
```

---

### **2. Qdrant 测试** (`test_qdrant.rs`)

| 测试函数                        | 功能         | 验证内容            |
| ------------------------------- | ------------ | ------------------- |
| `test_qdrant_connection`        | 连接测试     | Qdrant 服务是否运行 |
| `test_collection_operations`    | 集合操作     | 创建/删除集合       |
| `test_vector_insert_and_search` | 向量搜索     | 插入向量并搜索      |
| `test_payload_filtering`        | Payload 过滤 | 元数据存储和查询    |

**运行**:

```bash
cargo test --test test_qdrant -- --nocapture
```

---

### **3. 集成测试** (`test_integration.rs`)

| 测试函数                | 功能           | 验证内容               |
| ----------------------- | -------------- | ---------------------- |
| `test_full_pipeline`    | 完整流程       | Ollama → Qdrant 端到端 |
| `test_embedding_module` | Embedding 模块 | 自定义模块功能         |
| `test_db_module`        | DB 模块        | 自定义模块功能         |

**运行**:

```bash
cargo test --test test_integration -- --nocapture
```

**预期输出**:

```
running 3 tests
test test_full_pipeline ... ok
✅ Ollama 初始化成功
✅ Qdrant 连接成功
✅ 集合创建成功
✅ 已索引: /vault/travel/paris.jpg
✅ 已索引: /vault/pets/cat.jpg
✅ 搜索结果正确: "/vault/travel/paris.jpg"
✅ 测试数据已清理

✨ 完整流程测试通过！

test result: ok. 3 passed; 0 failed
```

---

## 🐛 测试失败排查

### **Ollama 测试失败**

```
Error: 无法连接到 Ollama，请确保服务正在运行
```

**解决方案**:

```bash
# 检查 Ollama 是否运行
ps aux | grep ollama

# 启动 Ollama
ollama serve

# 拉取模型
ollama pull nomic-embed-text
```

---

### **Qdrant 测试失败**

```
Error: 无法连接到 Qdrant，请确保服务正在运行
```

**解决方案**:

```bash
# 检查 Docker 容器
docker ps | grep qdrant

# 启动 Qdrant
docker run -d -p 6334:6334 --name qdrant qdrant/qdrant
```

---

### **集成测试失败**

```
assertion failed: 向量维度应该是 768
```

**可能原因**:

-   Ollama 模型不是 `nomic-embed-text`
-   模型版本不匹配

**解决方案**:

```bash
# 确认模型
ollama list

# 重新拉取
ollama pull nomic-embed-text
```

---

## 📊 测试覆盖率

查看测试覆盖率（需要安装 `tarpaulin`）:

```bash
# 安装
cargo install cargo-tarpaulin

# 运行
cargo tarpaulin --out Html
```

---

## 🎯 持续集成 (CI)

在 GitHub Actions 中运行测试：

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
    test:
        runs-on: ubuntu-latest

        services:
            qdrant:
                image: qdrant/qdrant
                ports:
                    - 6334:6334

        steps:
            - uses: actions/checkout@v3

            - name: Install Ollama
              run: |
                  curl -fsSL https://ollama.com/install.sh | sh
                  ollama serve &
                  ollama pull nomic-embed-text

            - name: Run tests
              run: cargo test --all
```

---

## 💡 最佳实践

1. **测试隔离**: 每个测试使用独立的集合名称
2. **清理资源**: 测试结束后删除临时数据
3. **有意义的断言**: 使用清晰的错误消息
4. **幂等性**: 测试可以重复运行

**示例**:

```rust
#[tokio::test]
async fn test_example() -> Result<()> {
    // Setup
    let collection = format!("test_{}", uuid::Uuid::new_v4());

    // Test
    // ...

    // Cleanup
    cleanup(&collection).await?;

    Ok(())
}
```

---

## 🚀 下一步

所有测试通过后，继续开发：

-   [ ] 上下文提取模块
-   [ ] 搜索 API
-   [ ] 文件监听
-   [ ] Web 服务
