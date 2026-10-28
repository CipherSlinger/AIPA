# 构建注意事项

## 2026-10-28 验证：`npm run build` 当前可正常完成

在 Windows 开发机（electron-ui/）上连续三次完整执行 `npm run build`
（icons → main → plugins → clawd → preload → renderer）均在 ~8s 内成功，
没有 segfault。此前记录的 segfault 可能是旧 Linux 环境或内存压力导致。

分步构建仍可作为 fallback：

```bash
# 在 electron-ui/ 目录下
node_modules/.bin/tsc -p tsconfig.main.json
node_modules/.bin/tsc -p tsconfig.preload.json
node_modules/.bin/vite build
```

## 启动应用

```bash
# 生产模式（加载 dist/renderer/index.html）
node_modules/.bin/electron dist/main/index.js

# 开发模式（Vite HMR，需先启动 dev:renderer）
NODE_ENV=development node_modules/.bin/electron dist/main/index.js
```

注意：不要在生产构建时设置 `NODE_ENV=development`，会导致加载 localhost:5173。
