# Obsidian AI 神经中枢 - API 文档

## 快速启动

### 1. 启动依赖服务

```bash
# 启动 Ollama
ollama serve

# 拉取 embedding 模型
ollama pull qwen3-embedding:4b

# 启动 Qdrant (Docker)
docker run -d -p 6334:6334 -p 6333:6333 qdrant/qdrant
```

### 2. 启动 API 服务器

```bash
# 开发模式
cargo run

# Release 模式 (推荐生产环境)
cargo run --release
```

**默认配置**:

-   API 端口: `37337`
-   Qdrant: `http://localhost:6334`
-   集合名称: `obsidian_notes`

**自定义配置** (环境变量):

```bash
export QDRANT_URL="http://localhost:6334"
export COLLECTION_NAME="my_notes"
export PORT=8080

cargo run --release
```

---

## API 端点

### 1. 健康检查

```bash
GET /api/health
```

**响应**:

```json
{
    "status": "ok",
    "version": "0.1.0"
}
```

**示例**:

```bash
curl http://localhost:37337/api/health
```

---

### 2. 索引文档

```bash
POST /api/index
Content-Type: application/json
```

**请求体**:

```json
{
    "path": "/vault/notes/rust.md",
    "content": "# Rust 学习笔记\n\n## 特性\n- 内存安全\n- 零成本抽象",
    "point_type": "text" // "text" 或 "image"
}
```

**响应**:

```json
{
    "success": true,
    "message": "Indexed 2 text chunks and 0 images",
    "text_count": 2,
    "image_count": 0
}
```

**示例**:

```bash
# 索引纯文本文档
curl -X POST http://localhost:37337/api/index \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/notes/rust.md",
    "content": "# Rust\n\nRust 是一门系统编程语言。\n\n## 特性\n- 内存安全\n- 并发安全",
    "point_type": "text"
  }'

# 索引包含图片的文档
curl -X POST http://localhost:37337/api/index \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/travel/paris.md",
    "content": "# 巴黎之旅\n\n埃菲尔铁塔非常壮观。\n\n![[paris/eiffel.jpg]]",
    "point_type": "image"
  }'
```

---

### 3. 语义搜索

```bash
POST /api/search
Content-Type: application/json
```

**请求体**:

```json
{
    "query": "Rust 的内存安全特性",
    "limit": 10, // 可选，默认 10
    "point_type": "text" // 可选: "text" 或 "image"
}
```

**响应**:

```json
{
    "success": true,
    "count": 2,
    "results": [
        {
            "path": "/notes/rust.md",
            "content": "## 特性\n- 内存安全\n- 并发安全",
            "point_type": "text",
            "score": 0.923
        },
        {
            "path": "/notes/rust.md",
            "content": "# Rust\n\nRust 是一门系统编程语言。",
            "point_type": "text",
            "score": 0.856
        }
    ]
}
```

**示例**:

```bash
# 搜索所有内容
curl -X POST http://localhost:37337/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "如何保证内存安全",
    "limit": 5
  }'

# 只搜索文本
curl -X POST http://localhost:37337/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Rust 特性",
    "limit": 5,
    "point_type": "text"
  }'

# 只搜索图片
curl -X POST http://localhost:37337/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "埃菲尔铁塔",
    "limit": 5,
    "point_type": "image"
  }'
```

---

## TypeScript 集成示例

```typescript
// API 客户端
class ObsidianSearchAPI {
    private baseUrl: string;

    constructor(baseUrl: string = "http://localhost:37337") {
        this.baseUrl = baseUrl;
    }

    // 健康检查
    async health(): Promise<{ status: string; version: string }> {
        const response = await fetch(`${this.baseUrl}/api/health`);
        return response.json();
    }

    // 索引文档
    async index(
        path: string,
        content: string,
        pointType: "text" | "image" = "text"
    ): Promise<{
        success: boolean;
        text_count?: number;
        image_count?: number;
    }> {
        const response = await fetch(`${this.baseUrl}/api/index`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path, content, point_type: pointType }),
        });
        return response.json();
    }

    // 语义搜索
    async search(
        query: string,
        limit: number = 10,
        pointType?: "text" | "image"
    ): Promise<{
        success: boolean;
        count: number;
        results: Array<{
            path: string;
            content: string;
            point_type: string;
            score: number;
        }>;
    }> {
        const response = await fetch(`${this.baseUrl}/api/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, limit, point_type: pointType }),
        });
        return response.json();
    }
}

// Obsidian 插件集成示例
export default class MyPlugin extends Plugin {
    private api: ObsidianSearchAPI;

    async onload() {
        this.api = new ObsidianSearchAPI();

        // 检查服务状态
        try {
            const health = await this.api.health();
            console.log("Search service:", health);
        } catch (error) {
            new Notice("搜索服务未启动");
        }

        // 监听文件修改，自动索引
        this.registerEvent(
            this.app.vault.on("modify", async (file) => {
                if (file.extension === "md") {
                    const content = await this.app.vault.read(file);
                    await this.api.index(file.path, content, "image");
                }
            })
        );

        // 添加搜索命令
        this.addCommand({
            id: "semantic-search",
            name: "语义搜索",
            callback: async () => {
                const query = await this.getSearchQuery();
                const results = await this.api.search(query, 10);
                this.displayResults(results);
            },
        });
    }
}
```

---

## 性能优化建议

### 批量索引

```bash
# 使用脚本批量索引 vault 中的所有笔记
for file in vault/**/*.md; do
  content=$(cat "$file")
  curl -X POST http://localhost:37337/api/index \
    -H "Content-Type: application/json" \
    -d "{\"path\": \"$file\", \"content\": $(jq -Rs . <<< "$content"), \"point_type\": \"image\"}" &
done
wait
```

### 增量更新

只对修改过的文件重新索引，而不是全量重建。

### 缓存策略

-   Rust 端缓存最近的查询向量
-   TypeScript 端缓存搜索结果 (设置 TTL)

---

## 故障排查

### 1. API 服务无法启动

```bash
# 检查端口是否被占用
lsof -i :37337

# 检查 Qdrant 连接
curl http://localhost:6334/collections
```

### 2. Embedding 生成失败

```bash
# 检查 Ollama 服务
curl http://localhost:11434/api/tags

# 确认模型已下载
ollama list | grep qwen3-embedding
```

### 3. 搜索无结果

```bash
# 检查是否有索引数据
curl -X POST http://localhost:37337/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "limit": 100}'
```

---

## 开发与测试

```bash
# 运行所有测试
cargo test

# 运行集成测试 (需要服务运行)
cargo test --test test_api -- --ignored

# 查看日志
RUST_LOG=debug cargo run
```

---

## 部署

### Docker 部署 (TODO)

```dockerfile
FROM rust:1.75 as builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/ob-image-vector-rs /usr/local/bin/
EXPOSE 37337
CMD ["ob-image-vector-rs"]
```

### 系统服务 (systemd)

```ini
[Unit]
Description=Obsidian Search API
After=network.target

[Service]
Type=simple
User=obsidian
WorkingDirectory=/opt/obsidian-search
Environment="QDRANT_URL=http://localhost:6334"
Environment="PORT=37337"
ExecStart=/opt/obsidian-search/ob-image-vector-rs
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

---

## License

MIT
