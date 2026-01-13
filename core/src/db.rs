use anyhow::Result;
use qdrant_client::qdrant::{
    CreateCollectionBuilder, Distance, PointStruct, SearchPointsBuilder, UpsertPointsBuilder,
    VectorParamsBuilder,
};
use qdrant_client::Qdrant;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

/// 集合统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionStats {
    pub total_points: u64,
    pub collection_name: String,
}

/// 点类型：文本或图片
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PointType {
    Text,
    Image,
}

impl PointType {
    pub fn as_str(&self) -> &str {
        match self {
            PointType::Text => "text",
            PointType::Image => "image",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "text" => Some(PointType::Text),
            "image" => Some(PointType::Image),
            _ => None,
        }
    }
}

/// 待索引的点
#[derive(Debug, Clone)]
pub struct IndexPoint {
    pub path: String,
    pub content: String,
    pub point_type: PointType,
    pub embedding: Vec<f32>,
}

/// 搜索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    /// 文件路径
    pub path: String,
    /// 原始内容片段
    pub content: String,
    /// 点类型
    pub point_type: PointType,
    /// 相似度分数 (0.0 - 1.0, 越高越相似)
    pub score: f32,
    /// 索引时间戳
    pub timestamp: i64,
}

pub struct VectorDB {
    client: Qdrant,
    collection_name: String,
}

impl VectorDB {
    /// 连接到 Qdrant (默认为 localhost:6334)
    pub async fn new(uri: &str, collection_name: &str) -> Result<Self> {
        let client = Qdrant::from_url(uri).build()?;
        Ok(Self {
            client,
            collection_name: collection_name.to_string(),
        })
    }

    /// 初始化集合 Schema
    pub async fn init_collection(&self) -> Result<()> {
        if !self.client.collection_exists(&self.collection_name).await? {
            println!("Creating collection '{}'...", self.collection_name);

            self.client
                .create_collection(
                    CreateCollectionBuilder::new(&self.collection_name).vectors_config(
                        VectorParamsBuilder::new(
                            super::config::EMBEDDING_DIM as u64,
                            Distance::Cosine,
                        ),
                    ),
                )
                .await?;
            println!("Collection created successfully.");
        } else {
            println!("Collection '{}' already exists.", self.collection_name);
        }
        Ok(())
    }

    /// 通用点插入方法 (支持 text 和 image 类型)
    pub async fn upsert_point(
        &self,
        path: &str,
        content: &str,
        point_type: PointType,
        embedding: Vec<f32>,
    ) -> Result<()> {
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64;
        let point_id = Uuid::new_v4().to_string();

        let points = vec![PointStruct::new(
            point_id,
            embedding,
            [
                ("path", path.into()),
                ("content", content.into()),
                ("point_type", point_type.as_str().into()),
                ("timestamp", timestamp.into()),
            ],
        )];

        self.client
            .upsert_points(UpsertPointsBuilder::new(&self.collection_name, points))
            .await?;

        Ok(())
    }

    /// 批量插入点
    pub async fn upsert_batch(&self, index_points: Vec<IndexPoint>) -> Result<()> {
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64;

        let points: Vec<PointStruct> = index_points
            .into_iter()
            .map(|ip| {
                let point_id = Uuid::new_v4().to_string();
                PointStruct::new(
                    point_id,
                    ip.embedding,
                    [
                        ("path", ip.path.into()),
                        ("content", ip.content.into()),
                        ("point_type", ip.point_type.as_str().into()),
                        ("timestamp", timestamp.into()),
                    ],
                )
            })
            .collect();

        self.client
            .upsert_points(UpsertPointsBuilder::new(&self.collection_name, points))
            .await?;

        Ok(())
    }

    /// 存入图片向量与元数据 (保留向后兼容)
    #[deprecated(note = "Use upsert_point with PointType::Image instead")]
    pub async fn upsert_image(
        &self,
        file_path: &str,
        image_hash: &str,
        embedding: Vec<f32>,
    ) -> Result<()> {
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64;

        // 使用 image_hash 作为 Point ID (UUIDv5) 这里的逻辑可以优化，
        // 简单起见我们先随机生成一个 ID，或者基于 Hash 生成 UUID
        // 为了确保去重，最好是基于文件内容的 deterministic ID，但这里演示用 random
        let point_id = Uuid::new_v4().to_string();

        let points = vec![PointStruct::new(
            point_id,
            embedding,
            [
                ("file_path", file_path.into()),
                ("image_hash", image_hash.into()),
                ("timestamp", timestamp.into()),
            ],
        )];

        self.client
            .upsert_points(UpsertPointsBuilder::new(&self.collection_name, points))
            .await?;

        println!("Indexed image: {}", file_path);
        Ok(())
    }

    /// 搜索相似内容 (文本或图片)
    ///
    /// # 参数
    /// - `query_vector`: 查询向量
    /// - `limit`: 返回结果数量
    /// - `filter_type`: 可选的类型过滤 (只返回 text 或 image)
    ///
    /// # 返回
    /// 返回最相似的内容列表，按相似度从高到低排序
    pub async fn search(
        &self,
        query_vector: Vec<f32>,
        limit: usize,
        _filter_type: Option<PointType>,
    ) -> Result<Vec<SearchResult>> {
        // TODO: 实现 filter_type 过滤逻辑
        let search_result = self
            .client
            .search_points(
                SearchPointsBuilder::new(&self.collection_name, query_vector, limit as u64)
                    .with_payload(true),
            )
            .await?;

        let mut results = Vec::new();
        for point in search_result.result {
            let payload = point.payload;

            let path = payload
                .get("path")
                .and_then(|v| v.as_str())
                .map_or("", |v| v)
                .to_string();

            let content = payload
                .get("content")
                .and_then(|v| v.as_str())
                .map_or("", |v| v)
                .to_string();

            let point_type_str = payload
                .get("point_type")
                .and_then(|v| v.as_str())
                .map_or("text", |v| v);

            let point_type = PointType::from_str(point_type_str).unwrap_or(PointType::Text);

            let timestamp = payload
                .get("timestamp")
                .and_then(|v| v.as_integer())
                .unwrap_or(0);

            results.push(SearchResult {
                path,
                content,
                point_type,
                score: point.score,
                timestamp,
            });
        }

        Ok(results)
    }

    /// 清空集合中的所有数据
    pub async fn clear_collection(&self) -> Result<()> {
        // 删除集合
        self.client.delete_collection(&self.collection_name).await?;

        // 重新创建集合
        self.init_collection().await?;

        println!(
            "Collection '{}' cleared successfully.",
            self.collection_name
        );
        Ok(())
    }

    /// 获取集合统计信息
    pub async fn get_stats(&self) -> Result<CollectionStats> {
        let collection_info = self.client.collection_info(&self.collection_name).await?;

        let points_count = collection_info
            .result
            .and_then(|r| r.points_count)
            .unwrap_or(0);

        Ok(CollectionStats {
            total_points: points_count,
            collection_name: self.collection_name.clone(),
        })
    }

    /// 搜索相似图片 (保留向后兼容，使用旧的 SearchResult 格式)
    #[deprecated(note = "Use search() method instead")]
    pub async fn search_similar(
        &self,
        query_vector: Vec<f32>,
        limit: usize,
    ) -> Result<Vec<SearchResult>> {
        // 构建搜索请求
        let search_result = self
            .client
            .search_points(
                SearchPointsBuilder::new(&self.collection_name, query_vector, limit as u64)
                    .with_payload(true), // 返回元数据
            )
            .await?;

        // 解析结果
        let mut results = Vec::new();
        for point in search_result.result {
            // 提取 payload 中的字段
            let payload = point.payload;

            let file_path = payload
                .get("file_path")
                .and_then(|v| v.as_str())
                .map_or("", |v| v)
                .to_string();

            let image_hash = payload
                .get("image_hash")
                .and_then(|v| v.as_str())
                .map_or("", |v| v)
                .to_string();

            let timestamp = payload
                .get("timestamp")
                .and_then(|v| v.as_integer())
                .unwrap_or(0);

            results.push(SearchResult {
                path: file_path,
                content: image_hash, // Store hash in content field for backward compat
                point_type: PointType::Image,
                score: point.score,
                timestamp,
            });
        }

        Ok(results)
    }
}
