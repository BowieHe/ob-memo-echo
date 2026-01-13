# 配置集中化重构总结

## 🎯 改进目标

将分散在各处的硬编码配置（模型名称、向量维度、服务地址等）集中到一个配置模块，遵循 DRY 原则。

## ✅ 已完成的改进

### 1. 创建配置模块 (`src/config.rs`)

```rust
/// Ollama Embedding 模型名称
pub const EMBEDDING_MODEL: &str = "qwen3-embedding:4b";

/// Embedding 向量维度
pub const EMBEDDING_DIM: usize = 2560;

/// Qdrant 服务地址
pub const QDRANT_URL: &str = "http://localhost:6334";

/// Ollama 服务地址
pub const OLLAMA_URL: &str = "http://localhost:11434";
```

### 2. 更新核心模块使用配置

#### `src/embedding.rs`

```rust
// 之前
pub fn default() -> Self {
    Self::new("http://localhost:11434", "qwen3-embedding:4b")
}

// 之后
pub fn default() -> Self {
    Self::new(crate::config::OLLAMA_URL, crate::config::EMBEDDING_MODEL)
}
```

#### `src/db.rs`

```rust
// 之前
.vectors_config(VectorParamsBuilder::new(2560, Distance::Cosine))

// 之后
.vectors_config(VectorParamsBuilder::new(crate::config::EMBEDDING_DIM as u64, Distance::Cosine))
```

### 3. 测试文件也应使用配置

测试文件中应该使用：

```rust
use obsidian_image_search::config::*;

// 使用常量
let request = json!({
    "model": EMBEDDING_MODEL,
    "prompt": test_text
});

assert_eq!(embedding.len(), EMBEDDING_DIM, "向量维度应该是 {}", EMBEDDING_DIM);
```

## 📊 优势

1. **单一真实来源 (Single Source of Truth)**

    - 修改模型只需改 `config.rs` 一处
    - 避免遗漏和不一致

2. **易于维护**

    - 清晰的配置管理
    - 减少重复代码

3. **类型安全**

    - 使用常量而非字符串字面量
    - 编译时检查

4. **易于测试**
    - 可以轻松切换不同配置进行测试
    - 未来可扩展为支持环境变量

## 🔄 下一步建议

1. 更新所有测试文件使用配置常量
2. 考虑添加环境变量支持：

    ```rust
    pub fn embedding_model() -> &'static str {
        std::env::var("EMBEDDING_MODEL")
            .unwrap_or(EMBEDDING_MODEL.to_string())
    }
    ```

3. 添加配置验证函数
4. 考虑使用配置文件（如 `config.toml`）

## 📝 使用示例

```rust
use obsidian_image_search::config::*;

// 创建 Embedding 客户端
let embedder = OllamaEmbedding::new(OLLAMA_URL, EMBEDDING_MODEL);

// 创建向量数据库
let db = VectorDB::new(QDRANT_URL, "my_collection").await?;

// 断言向量维度
assert_eq!(vector.len(), EMBEDDING_DIM);
```
