use anyhow::Result;

use crate::chunker::chunk_markdown;
use crate::db::{CollectionStats, IndexPoint, PointType, SearchResult, VectorDB};
use crate::embedding::OllamaEmbedding;
use crate::image_context::{extract_image_links, extract_section_context};

/// 搜索服务 - 整合 chunking + embedding + database
pub struct SearchService {
    db: VectorDB,
    embedder: OllamaEmbedding,
}

impl SearchService {
    /// 创建新的搜索服务
    pub async fn new(qdrant_url: &str, collection_name: &str) -> Result<Self> {
        let db = VectorDB::new(qdrant_url, collection_name).await?;
        db.init_collection().await?;

        let embedder = OllamaEmbedding::default();

        Ok(Self { db, embedder })
    }

    /// 索引 Markdown 文件 (仅文本)
    ///
    /// # 参数
    /// - `file_path`: 文件路径
    /// - `content`: Markdown 内容
    ///
    /// # 返回
    /// 索引的文本片段数量
    pub async fn index_markdown_file(&self, file_path: &str, content: &str) -> Result<usize> {
        // 1. 切分文本
        let chunks = chunk_markdown(content);

        if chunks.is_empty() {
            return Ok(0);
        }

        // 2. 批量生成 embeddings
        let texts: Vec<&str> = chunks.iter().map(|c| c.content.as_str()).collect();
        let embeddings = self.embedder.encode_batch(texts).await?;

        // 3. 构建索引点
        let index_points: Vec<IndexPoint> = chunks
            .into_iter()
            .zip(embeddings.into_iter())
            .map(|(chunk, embedding)| IndexPoint {
                path: file_path.to_string(),
                content: chunk.content,
                point_type: PointType::Text,
                embedding,
            })
            .collect();

        let count = index_points.len();

        // 4. 批量插入数据库
        self.db.upsert_batch(index_points).await?;

        Ok(count)
    }

    /// 索引 Markdown 文件 (包含图片上下文)
    ///
    /// # 参数
    /// - `file_path`: 文件路径
    /// - `content`: Markdown 内容
    ///
    /// # 返回
    /// (文本片段数, 图片数)
    pub async fn index_markdown_with_images(
        &self,
        file_path: &str,
        content: &str,
    ) -> Result<(usize, usize)> {
        let mut index_points = Vec::new();

        // 1. 索引文本片段
        let text_chunks = chunk_markdown(content);
        let text_count = text_chunks.len();

        if !text_chunks.is_empty() {
            let texts: Vec<&str> = text_chunks.iter().map(|c| c.content.as_str()).collect();
            let embeddings = self.embedder.encode_batch(texts).await?;

            for (chunk, embedding) in text_chunks.into_iter().zip(embeddings.into_iter()) {
                index_points.push(IndexPoint {
                    path: file_path.to_string(),
                    content: chunk.content,
                    point_type: PointType::Text,
                    embedding,
                });
            }
        }

        // 2. 提取图片链接并索引其上下文
        let image_links = extract_image_links(content);
        let image_count = image_links.len();

        for link in image_links {
            // 提取图片所在section的上下文
            let context = extract_section_context(content, link.position);

            if !context.is_empty() {
                let embedding = self.embedder.encode(&context).await?;

                index_points.push(IndexPoint {
                    path: link.path.clone(),
                    content: context,
                    point_type: PointType::Image,
                    embedding,
                });
            }
        }

        // 3. 批量插入
        if !index_points.is_empty() {
            self.db.upsert_batch(index_points).await?;
        }

        Ok((text_count, image_count))
    }

    /// 语义搜索
    ///
    /// # 参数
    /// - `query`: 搜索查询
    /// - `limit`: 返回结果数量
    /// - `filter_type`: 可选的类型过滤
    ///
    /// # 返回
    /// 搜索结果列表
    pub async fn search_semantic(
        &self,
        query: &str,
        limit: usize,
        filter_type: Option<PointType>,
    ) -> Result<Vec<SearchResult>> {
        // 1. 将查询转换为向量
        let query_vector = self.embedder.encode(query).await?;

        // 2. 在数据库中搜索
        let results = self.db.search(query_vector, limit, filter_type).await?;

        Ok(results)
    }

    /// 清空数据库
    pub async fn clear_all(&self) -> Result<()> {
        self.db.clear_collection().await
    }

    /// 获取统计信息
    pub async fn get_stats(&self) -> Result<CollectionStats> {
        self.db.get_stats().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 集成测试需要 Ollama 和 Qdrant 服务运行
    #[tokio::test]
    #[ignore] // 默认忽略，需要手动运行
    async fn test_index_and_search_text() {
        let service = SearchService::new("http://localhost:6334", "test_collection")
            .await
            .unwrap();

        let markdown = r#"# Rust 编程

Rust 是一门系统编程语言。

## 特性

- 内存安全
- 零成本抽象
- 并发安全

## 应用场景

Rust 适用于系统编程、Web 开发等场景。
"#;

        let count = service
            .index_markdown_file("/test/rust.md", markdown)
            .await
            .unwrap();

        assert!(count > 0, "应该索引至少一个文本片段");

        // 搜索
        let results = service
            .search_semantic("Rust的特性有哪些", 5, None)
            .await
            .unwrap();

        assert!(!results.is_empty(), "应该找到相关结果");
        assert_eq!(results[0].point_type, PointType::Text);
    }

    #[tokio::test]
    #[ignore]
    async fn test_index_with_images() {
        let service = SearchService::new("http://localhost:6334", "test_images")
            .await
            .unwrap();

        let markdown = r#"# 旅行相册

## 巴黎之旅

2024年春天游览了巴黎。埃菲尔铁塔非常壮观。

![[travel/paris_eiffel.jpg]]

## 伦敦之旅

参观了大本钟。

![[travel/london_bigben.jpg]]
"#;

        let (text_count, image_count) = service
            .index_markdown_with_images("/test/travel.md", markdown)
            .await
            .unwrap();

        assert!(text_count > 0);
        assert_eq!(image_count, 2);

        // 搜索图片
        let results = service
            .search_semantic("埃菲尔铁塔", 5, Some(PointType::Image))
            .await
            .unwrap();

        // Note: 实际测试需要验证是否返回了巴黎图片
        println!("Found {} image results", results.len());
    }
}
