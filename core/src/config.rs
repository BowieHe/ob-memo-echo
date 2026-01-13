/// 配置模块：统一管理模型和向量相关的常量
///
/// 这样修改模型时只需要改这一个地方

/// Ollama Embedding 模型名称
pub const EMBEDDING_MODEL: &str = "qwen3-embedding:4b";

/// Embedding 向量维度
pub const EMBEDDING_DIM: usize = 2560;

/// Qdrant 服务地址
pub const QDRANT_URL: &str = "http://localhost:6334";

/// Ollama 服务地址
pub const OLLAMA_URL: &str = "http://localhost:11434";
