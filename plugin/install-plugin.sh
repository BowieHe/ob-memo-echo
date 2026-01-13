#!/bin/bash

# Obsidian 插件安装脚本

echo "🔧 Obsidian 语义搜索插件安装向导"
echo ""

# 检查是否提供了 vault 路径
if [ -z "$1" ]; then
    echo "❌ 请提供你的 Obsidian Vault 路径"
    echo ""
    echo "用法:"
    echo "  ./install-plugin.sh /path/to/your/vault"
    echo ""
    echo "示例:"
    echo "  ./install-plugin.sh ~/Documents/MyVault"
    exit 1
fi

VAULT_PATH="$1"
PLUGIN_NAME="obsidian-image-vector"
PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/$PLUGIN_NAME"

# 检查 vault 是否存在
if [ ! -d "$VAULT_PATH" ]; then
    echo "❌ Vault 路径不存在: $VAULT_PATH"
    exit 1
fi

# 创建 .obsidian/plugins 目录(如果不存在)
mkdir -p "$VAULT_PATH/.obsidian/plugins"

# 创建插件目录
echo "📁 创建插件目录: $PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR"

# 复制必要文件
echo "📋 复制插件文件..."
cp main.js "$PLUGIN_DIR/"
cp manifest.json "$PLUGIN_DIR/"
cp styles.css "$PLUGIN_DIR/"

echo ""
echo "✅ 插件安装完成!"
echo ""
echo "📝 下一步:"
echo "1. 打开 Obsidian"
echo "2. 进入 设置 → 社区插件"
echo "3. 关闭 安全模式 (如果还没关闭)"
echo "4. 刷新插件列表"
echo "5. 启用 'Semantic Search' 插件"
echo ""
echo "🚀 启动 Rust 服务:"
echo "   cd ../core && cargo run --release"
echo ""
