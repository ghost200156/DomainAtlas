# DomainAtlas Backend

FastAPI 后端，负责显式学习工作流、三个 Agent 阶段、结构化校验、任务事件、JSON Demo Store 和模型回退。完整项目安装说明见仓库根目录的 [`README.md`](../README.md)。

## 环境要求

- Python 3.12+
- uv

## 安装

从仓库根目录执行：

```bash
uv sync --directory backend
```

## 配置

复制 `backend/.env.example` 为 `backend/.env`，然后填写 OpenAI 兼容服务：

```dotenv
OPENAI_API_KEY=your-api-key
OPENAI_API_BASE=https://your-compatible-api.example.com/v1
OPENAI_MODEL=qwen3.5-plus
DEMO_AGENT_MODE=auto
```

执行模式：

- `auto`：优先调用真实模型，失败时回退到演示数据；
- `live`：模型错误直接使任务失败，适合排查集成问题；
- `fixture`：始终使用固定演示数据，不调用模型。

不要提交包含真实 API Key 的 `backend/.env`。

## 开发启动

从 `backend` 目录执行：

```bash
uv run uvicorn app.main:app --app-dir src --host 127.0.0.1 --port 8000 --reload
```

访问地址：

- 健康检查：http://127.0.0.1:8000/health
- API 文档：http://127.0.0.1:8000/docs

## 生产方式启动本地构建

```bash
uv run uvicorn app.main:app --app-dir src --host 127.0.0.1 --port 8000
```

这仍然是单机 Demo：任务保存在 `backend/data/runs/`，进程内后台任务在服务重启后不会自动恢复。

## 验证

从仓库根目录执行：

```bash
uv run --directory backend pytest -q
uv run --directory backend ruff check .
```

## 常见问题

- 页面显示 `HYBRID MODE`：检查 API Key、兼容地址、模型名和模型响应时间；
- 修改 `.env` 后没有生效：重新启动后端；
- 旧任务仍显示旧模型：任务保存了创建时的执行结果，请新建任务验证配置；
- 后端重启后任务停在生成中：当前 Demo 没有可恢复任务队列，需要重新发起该任务。
