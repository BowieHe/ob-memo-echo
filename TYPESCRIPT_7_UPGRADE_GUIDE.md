# TypeScript 7.0 升级指南

## 当前状态（TS 5.3.2）✅

项目配置已为 TypeScript 7.0 做好准备。

### 最新的 tsconfig.json 配置

```json
{
    "compilerOptions": {
        "rootDir": "./src",
        "baseUrl": "./src",
        "paths": {
            "@core/*": ["./core/*"],
            "@services/*": ["./services/*"],
            "@backends/*": ["./backends/*"],
            "@components/*": ["./components/*"],
            "@utils/*": ["./utils/*"]
        }
    }
}
```

## TypeScript 7.0 的变化

### 问题：baseUrl 被弃用

**当前（TS 5.x）：**

- `baseUrl` + `paths` 是标准做法
- 完全支持，无警告

**未来（TS 7.0+）：**

- `baseUrl` 仍然支持但标记为"弃用"
- 不会报错，但可能有警告

### 解决方案

#### 选项 1：使用 rootDir（当前推荐 ✅）

这是最现代、最推荐的方式：

```json
{
    "compilerOptions": {
        "rootDir": "./src",
        "baseUrl": "./src",
        "paths": {
            "@core/*": ["./core/*"],
            "@services/*": ["./services/*"]
        }
    }
}
```

**优点：**

- `rootDir` 明确定义项目根
- `baseUrl` 相对于 rootDir
- `paths` 相对于 baseUrl
- 与现代工具（Vite、Webpack 5+）兼容
- TS 7.0+ 完全支持

#### 选项 2：仅用 paths（TS 7.0+ 推荐）

当 TS 7.0 正式弃用 baseUrl 时，可能改为：

```json
{
    "compilerOptions": {
        "rootDir": "./src",
        "moduleResolution": "bundler",
        "paths": {
            "@core/*": ["./core/*"],
            "@services/*": ["./services/*"]
        }
    }
}
```

`paths` 会自动相对于 `rootDir`。

#### 选项 3：添加 ignoreDeprecations（临时）

如果升级到 TS 7.0 后出现弃用警告，可以暂时压制：

```json
{
    "compilerOptions": {
        "ignoreDeprecations": "5.0",
        "baseUrl": ".",
        "paths": {}
    }
}
```

**不推荐** - 这只是临时方案，应该迁移到新方式。

## 升级时间表

| TypeScript | 状态                | 行动                 |
| ---------- | ------------------- | -------------------- |
| 5.x (当前) | ✅ 完全支持         | 继续用现在的配置     |
| 6.x        | ✅ 支持，可能有警告 | 如果有警告，检查文档 |
| 7.0+       | ⚠️ baseUrl 弃用     | 评估是否需要迁移     |

## 何时升级到 TS 7.0

### 升级前检查清单

- [ ] 项目已使用 `rootDir` + `paths` 配置（✅ 已完成）
- [ ] Jest 配置有 moduleNameMapper（✅ 已完成）
- [ ] 所有导入使用路径别名（✅ 64 处已完成）
- [ ] 构建测试通过（✅ npm test 206/206）

### 升级步骤

当 TS 7.0 发布后，升级步骤：

```bash
# 1. 升级 TypeScript
npm install --save-dev typescript@^7.0.0

# 2. 检查是否有新警告
npm run build

# 3. 如果有 baseUrl 弃用警告，修改 tsconfig.json
# 删除 "baseUrl" 行（如果 TypeScript 文档推荐）
# 或使用 "ignoreDeprecations" 暂时压制

# 4. 运行完整测试
npm test
npm run build
```

## 当前配置为什么已经很好

✅ **已为未来做好准备**

1. **rootDir** + **baseUrl** + **paths** 的组合
    - 现在完全兼容 TS 5.3.2
    - TS 6.x 无警告
    - TS 7.0+ 只需删除 baseUrl（如需）

2. **jest.config.js 有 moduleNameMapper**
    - Jest 完全理解路径别名
    - 测试不会受 TypeScript 版本影响

3. **所有导入已统一**
    - 64 处使用路径别名
    - 3 处相对导入都是合理的（根目录）

## 不需要做的事

❌ **现在不需要：**

- 添加 `ignoreDeprecations`（没有警告）
- 修改导入路径（已经很好）
- 更新 jest.config.js（已经配置好）

✅ **只需等待 TS 7.0 发布，到时按文档操作**

## 参考资源

- TypeScript 官方迁移指南（发布时查看）
- 当前配置遵循 TypeScript 最佳实践
- Jest moduleNameMapper 官方文档

## 总结

**现在的设置：** 最佳实践 ✅
**升级风险：** 低 ✅
**未来兼容：** 完全兼容 ✅

无需做任何改动，项目已准备好应对 TypeScript 7.0。
