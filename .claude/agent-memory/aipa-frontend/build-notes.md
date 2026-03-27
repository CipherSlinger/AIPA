# 构建注意事项

## 重要：npm run build 会 segfault

在此机器上 `npm run build` 会导致 segfault，必须分步执行：

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
