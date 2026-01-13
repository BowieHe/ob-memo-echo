// 使用库 crate
use ob_image_vector_rs::api::start_server;
use ob_image_vector_rs::search::SearchService;

use anyhow::Result;

#[tokio::main]
async fn main() -> Result<()> {
    println!("🚀 Obsidian AI 神经中枢 - 启动中...\n");

    // 读取环境变量配置
    let qdrant_url =
        std::env::var("QDRANT_URL").unwrap_or_else(|_| "http://localhost:6334".to_string());

    let collection_name =
        std::env::var("COLLECTION_NAME").unwrap_or_else(|_| "obsidian_notes".to_string());

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "37337".to_string())
        .parse()
        .unwrap_or(37337);

    // 创建搜索服务
    println!("📊 连接 Qdrant...");
    let search_service = SearchService::new(&qdrant_url, &collection_name).await?;
    println!("✅ 搜索服务初始化完成\n");

    // 启动 HTTP API 服务器
    start_server(search_service, port).await?;

    Ok(())
}
