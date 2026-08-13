# DomainAtlas Frontend

React Router 8 前端，提供任务创建、计划确认、生成进度、迷雾 Atlas 和自测交互。完整项目安装说明见仓库根目录的 [`README.md`](../README.md)。

## 环境要求

- Node.js 22+
- npm

## 安装

从仓库根目录执行：

```bash
npm --prefix frontend install
```

## 配置

复制 `frontend/.env.example` 为 `frontend/.env`。默认值适用于本地后端：

```dotenv
VITE_API_URL=http://127.0.0.1:8000/agent
VITE_API_BASE=http://127.0.0.1:8000/api
```

- `VITE_API_BASE`：任务、计划、Atlas、进度和自测 API；
- `VITE_API_URL`：保留的流式聊天原型接口。

## 开发启动

从仓库根目录执行：

```bash
npm --prefix frontend run dev
```

默认访问地址：http://127.0.0.1:5173

前端必须同时连接运行在 `http://127.0.0.1:8000` 的后端。页面出现 `NetworkError` 时，应先检查后端 `/health`。

## 生产构建与启动

```bash
npm --prefix frontend run build
```

Windows PowerShell：

```powershell
$env:HOST="127.0.0.1"
$env:PORT="5173"
npm --prefix frontend run start
```

macOS / Linux：

```bash
HOST=127.0.0.1 PORT=5173 npm --prefix frontend run start
```

## 验证

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

当前 `Dockerfile` 仅保留为后续部署基础，不代表已经具备正式生产部署方案。
