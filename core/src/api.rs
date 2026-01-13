use anyhow::Result;
use axum::{
    extract::{Json, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_http::cors::CorsLayer;

use crate::db::{CollectionStats, PointType};
use crate::search::SearchService;

/// API 状态 (共享的搜索服务)
pub struct ApiState {
    search_service: SearchService,
}

/// 健康检查响应
#[derive(Serialize)]
pub struct HealthResponse {
    status: String,
    version: String,
}

/// 索引请求
#[derive(Deserialize)]
pub struct IndexRequest {
    /// 文件路径
    path: String,
    /// 文件内容
    content: String,
    /// 点类型: "text" 或 "image"
    point_type: String,
}

/// 索引响应
#[derive(Serialize)]
pub struct IndexResponse {
    success: bool,
    message: String,
    /// 索引的文本片段数量
    text_count: Option<usize>,
    /// 索引的图片数量
    image_count: Option<usize>,
}

/// 搜索请求
#[derive(Deserialize)]
pub struct SearchRequest {
    /// 搜索查询
    query: String,
    /// 返回结果数量
    #[serde(default = "default_limit")]
    limit: usize,
    /// 可选的类型过滤: "text" 或 "image"
    point_type: Option<String>,
}

fn default_limit() -> usize {
    10
}

/// 搜索响应
#[derive(Serialize)]
pub struct SearchResponse {
    success: bool,
    results: Vec<SearchResultItem>,
    count: usize,
}

#[derive(Serialize)]
pub struct SearchResultItem {
    path: String,
    content: String,
    point_type: String,
    score: f32,
}

/// 清空数据库响应
#[derive(Serialize)]
pub struct ClearResponse {
    success: bool,
    message: String,
}

/// 统计信息响应
#[derive(Serialize)]
pub struct StatsResponse {
    success: bool,
    total_points: u64,
    collection_name: String,
}

/// API 错误响应
#[derive(Serialize)]
struct ErrorResponse {
    success: bool,
    error: String,
}

/// 自定义错误类型
struct ApiError(anyhow::Error);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let error_response = ErrorResponse {
            success: false,
            error: self.0.to_string(),
        };

        (StatusCode::INTERNAL_SERVER_ERROR, Json(error_response)).into_response()
    }
}

impl<E> From<E> for ApiError
where
    E: Into<anyhow::Error>,
{
    fn from(err: E) -> Self {
        Self(err.into())
    }
}

/// 健康检查端点
async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

/// 索引端点
async fn index(
    State(state): State<Arc<ApiState>>,
    Json(req): Json<IndexRequest>,
) -> Result<Json<IndexResponse>, ApiError> {
    let (text_count, image_count) = if req.point_type == "image" {
        // 索引带图片的文档
        state
            .search_service
            .index_markdown_with_images(&req.path, &req.content)
            .await?
    } else {
        // 仅索引文本
        let count = state
            .search_service
            .index_markdown_file(&req.path, &req.content)
            .await?;
        (count, 0)
    };

    Ok(Json(IndexResponse {
        success: true,
        message: format!(
            "Indexed {} text chunks and {} images",
            text_count, image_count
        ),
        text_count: Some(text_count),
        image_count: Some(image_count),
    }))
}

/// 清空数据库端点
async fn clear_database(
    State(state): State<Arc<ApiState>>,
) -> Result<Json<ClearResponse>, ApiError> {
    state.search_service.clear_all().await?;

    Ok(Json(ClearResponse {
        success: true,
        message: "Database cleared successfully".to_string(),
    }))
}

/// 获取统计信息端点
async fn get_stats(State(state): State<Arc<ApiState>>) -> Result<Json<StatsResponse>, ApiError> {
    let stats = state.search_service.get_stats().await?;

    Ok(Json(StatsResponse {
        success: true,
        total_points: stats.total_points,
        collection_name: stats.collection_name,
    }))
}

/// 搜索端点
async fn search(
    State(state): State<Arc<ApiState>>,
    Json(req): Json<SearchRequest>,
) -> Result<Json<SearchResponse>, ApiError> {
    let filter_type = req.point_type.as_ref().and_then(|pt| match pt.as_str() {
        "text" => Some(PointType::Text),
        "image" => Some(PointType::Image),
        _ => None,
    });

    let results = state
        .search_service
        .search_semantic(&req.query, req.limit, filter_type)
        .await?;

    let items: Vec<SearchResultItem> = results
        .iter()
        .map(|r| SearchResultItem {
            path: r.path.clone(),
            content: r.content.clone(),
            point_type: r.point_type.as_str().to_string(),
            score: r.score,
        })
        .collect();

    let count = items.len();

    Ok(Json(SearchResponse {
        success: true,
        results: items,
        count,
    }))
}

/// 创建 API 路由
pub fn create_router(search_service: SearchService) -> Router {
    let state = Arc::new(ApiState { search_service });

    Router::new()
        .route("/api/health", get(health_check))
        .route("/api/index", post(index))
        .route("/api/search", post(search))
        .route("/api/clear", post(clear_database))
        .route("/api/stats", get(get_stats))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

/// 启动 API 服务器
pub async fn start_server(search_service: SearchService, port: u16) -> Result<()> {
    let app = create_router(search_service);

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;

    println!("🚀 API server listening on http://{}", addr);
    println!("📖 Endpoints:");
    println!("   GET  /api/health  - Health check");
    println!("   POST /api/index   - Index content");
    println!("   POST /api/search  - Semantic search");
    println!("   POST /api/clear   - Clear database");
    println!("   GET  /api/stats   - Get statistics");

    axum::serve(listener, app).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::Request;
    use tower::ServiceExt;

    #[tokio::test]
    async fn test_health_endpoint() {
        let service = SearchService::new("http://localhost:6334", "test_api")
            .await
            .unwrap();

        let app = create_router(service);

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/health")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }
}
