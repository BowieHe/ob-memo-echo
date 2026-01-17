#!/bin/bash

# WSL 到 Windows Obsidian 插件安装脚本

echo "🔧 Obsidian 语义搜索插件安装向导 (WSL → Windows)"
echo ""

# 默认 Windows 路径 (WSL 格式)
DEFAULT_PATH="/mnt/c/Users/hbw23/OneDrive/Documents/Note"

# 检查是否提供了路径参数,否则使用默认值
if [ -z "$1" ]; then
    echo "ℹ️  未提供路径,使用默认路径: $DEFAULT_PATH"
    VAULT_PATH="$DEFAULT_PATH"
else
    WINDOWS_PATH="$1"
    
    # 转换 Windows 路径到 WSL 路径
    if [[ "$WINDOWS_PATH" == *":"* ]]; then
        # 处理 Windows 格式路径 (C:\Users\...)
        WINDOWS_PATH="${WINDOWS_PATH//\\//}"
        DRIVE="${WINDOWS_PATH:0:1}"
        DRIVE_LOWER=$(echo "$DRIVE" | tr '[:upper:]' '[:lower:]')
        REST_PATH="${WINDOWS_PATH:2}"
        VAULT_PATH="/mnt/${DRIVE_LOWER}${REST_PATH}"
    else
        # 已经是 WSL 路径格式
        VAULT_PATH="$WINDOWS_PATH"
    fi
fi

echo "📁 目标路径: $VAULT_PATH"

# 检查路径是否存在
if [ ! -d "$VAULT_PATH" ]; then
    echo "❌ Vault 路径不存在: $VAULT_PATH"
    echo ""
    echo "💡 请确认路径是否正确,或在 Obsidian 中查看实际路径"
    exit 1
fi

PLUGIN_NAME="memo-echo"
PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/$PLUGIN_NAME"

# 创建 .obsidian/plugins 目录
echo "📁 创建插件目录..."
mkdir -p "$VAULT_PATH/.obsidian/plugins"
mkdir -p "$PLUGIN_DIR"

# 检查必要文件是否存在
if [ ! -f "main.js" ]; then
    echo "❌ main.js 不存在,请先运行 npm run build"
    exit 1
fi

# 复制文件
echo "📋 复制插件文件到 Windows..."
cp main.js "$PLUGIN_DIR/" && echo "  ✓ main.js"
cp manifest.json "$PLUGIN_DIR/" && echo "  ✓ manifest.json"
cp styles.css "$PLUGIN_DIR/" && echo "  ✓ styles.css"

echo ""
echo "✅ 插件已成功安装到 Windows Obsidian!"
echo ""
echo "📝 下一步:"
echo "1. 打开 Obsidian (Windows)"
echo "2. 进入 设置 → 社区插件"
echo "3. 关闭 安全模式 (如果还没关闭)"
echo "4. 刷新插件列表"
echo "5. 启用 'Memo Echo' 插件"
echo ""
echo "✨ 享受你的 AI 知识助手吧!"
echo ""
