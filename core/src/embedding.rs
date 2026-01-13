use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};

/// Ollama Embedding 客户端
pub struct OllamaEmbedding {
    client: Client,
    base_url: String,
    model: String,
}

#[derive(Serialize)]
struct EmbeddingRequest {
    model: String,
    prompt: String,
}

#[derive(Deserialize)]
struct EmbeddingResponse {
    embedding: Vec<f32>,
}

impl OllamaEmbedding {
    /// 创建新的 Ollama 客户端
    ///
    /// # 参数
    /// - `base_url`: Ollama 服务地址，默认 "http://localhost:11434"
    /// - `model`: 模型名称，推荐 "nomic-embed-text" 或 "mxbai-embed-large"
    pub fn new(base_url: &str, model: &str) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.to_string(),
            model: model.to_string(),
        }
    }

    /// 默认配置（使用配置模块中的常量）
    pub fn default() -> Self {
        Self::new(super::config::OLLAMA_URL, super::config::EMBEDDING_MODEL)
    }

    /// 将文本转换为向量
    pub async fn encode(&self, text: &str) -> Result<Vec<f32>> {
        let url = format!("{}/api/embeddings", self.base_url);

        let request = EmbeddingRequest {
            model: self.model.clone(),
            prompt: text.to_string(),
        };

        let response = self.client.post(&url).json(&request).send().await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            anyhow::bail!("Ollama API error: {}", error_text);
        }

        let embedding_response: EmbeddingResponse = response.json().await?;

        Ok(embedding_response.embedding)
    }

    /// 批量编码（提高效率）
    pub async fn encode_batch(&self, texts: Vec<&str>) -> Result<Vec<Vec<f32>>> {
        let mut embeddings = Vec::new();

        for text in texts {
            let embedding = self.encode(text).await?;
            embeddings.push(embedding);
        }

        Ok(embeddings)
    }

    /// 检查 Ollama 服务是否可用
    pub async fn health_check(&self) -> Result<bool> {
        let url = format!("{}/api/tags", self.base_url);

        match self.client.get(&url).send().await {
            Ok(response) => Ok(response.status().is_success()),
            Err(_) => Ok(false),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_ollama_embedding() {
        let embedder = OllamaEmbedding::default();

        // 检查服务是否运行
        if !embedder.health_check().await.unwrap() {
            println!("Ollama 服务未运行，跳过测试");
            return;
        }

        let text = "这是一张巴黎埃菲尔铁塔的照片";
        let embedding = embedder.encode(text).await.unwrap();

        println!("向量维度: {}", embedding.len());
        println!("前5个值: {:?}", &embedding[..5]);

        assert!(embedding.len() > 0);
    }

    #[tokio::test]
    async fn test_batch_embedding() {
        let embedder = OllamaEmbedding::default();

        let texts = vec![
            "这是一张巴黎埃菲尔铁塔的照片",
            "这是一张纽约自由女神像的照片",
            "这是一张伦敦大本钟的照片",
        ];

        let embeddings = embedder.encode_batch(texts).await.unwrap();

        for (_i, embedding) in embeddings.iter().enumerate() {
            println!("向量维度: {}", embedding.len());
            println!("前5个值: {:?}", &embedding[..5]);
        }
    }
}
