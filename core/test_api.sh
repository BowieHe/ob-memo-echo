#!/bin/bash

echo "🧪 测试 Obsidian AI 神经中枢 API"
echo "================================"
echo ""

# 1. 健康检查
echo "1️⃣ 健康检查..."
HEALTH=$(curl -s http://localhost:37337/api/health)
if echo "$HEALTH" | grep -q "ok"; then
    echo "✅ API 服务正常运行"
else
    echo "❌ API 服务未响应"
    echo "   请检查 API 服务是否已启动: cargo run --release"
    exit 1
fi
echo ""

# 2. 索引测试
echo "2️⃣ 索引测试文档..."
INDEX_RESULT=$(curl -s -X POST http://localhost:37337/api/index \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/test/demo.md",
    "content": "# 测试文档\n\n这是一个用于测试的 Markdown 文档。\n\n## 功能\n\n- 语义搜索\n- 向量索引\n- 图片支持",
    "point_type": "text"
  }')

if echo "$INDEX_RESULT" | grep -q '"success":true'; then
    echo "✅ 索引成功"
else
    echo "❌ 索引失败"
    exit 1
fi
echo ""

# 3. 搜索测试
echo "3️⃣ 语义搜索测试..."
SEARCH_RESULT=$(curl -s -X POST http://localhost:37337/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "这个系统支持哪些功能",
    "limit": 3
  }')

if echo "$SEARCH_RESULT" | grep -q '"success":true'; then
    echo "✅ 搜索成功"
else
    echo "❌ 搜索失败"
    exit 1
fi
echo ""

echo "================================"
echo "🎉 所有测试通过！系统运行正常。"
echo ""
echo "💡 提示: 如果想查看详细结果，可以手动运行:"
echo "   curl -X POST http://localhost:37337/api/search \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"query\": \"测试\", \"limit\": 5}'"
