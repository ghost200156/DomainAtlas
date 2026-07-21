
# DomainAtlas

DomainAtlas 是一个知识地图式的领域学习 Agent，帮助用户在有限时间内建立对陌生领域的第一版结构化认知。

> **当前状态：第一版可运行 Demo（v0.1）。**
> 当前版本已经打通“创建学习任务 → 确认框架 → 研究与建图 → 迷雾探索 → 自测”的完整演示链路。

## 当前能力

- Planning、Research、Atlas 三个职责清晰的 Agent 阶段；
- 确认或修改框架后再开始研究和生成的人工检查点；
- 基于 FastAPI、JSON Demo Store 和进程内后台任务的可观察状态流；
- 带来源的结构化 Atlas、关系驱动的迷雾地图、节点学习进度和简单自测；
- `live`、`hybrid`、`fixture` 三种执行结果标识，模型异常时可以降级演示；
- 保留原有 `POST /agent` 流式聊天接口，方便后续接入真实模型。

Planning 与 Atlas 阶段可以使用真实模型；Research Agent 只在代码受控的中文维基检索结果中整理证据，每个模块最多取一条候选来源，避免模型自行编造网页来源。网络或模型异常时 `auto` 模式会透明降级，并在页面标记为混合模式。

## 在一台新电脑上运行

以下步骤不依赖本机的绝对路径。克隆或解压仓库后，只要在项目根目录 `DomainAtlas` 中执行即可。

### 1. 安装基础环境

需要：

- Git（如果通过 Git 克隆项目）；
- Python 3.12 或更高版本；
- [uv](https://docs.astral.sh/uv/getting-started/installation/)；
- Node.js 22 或更高版本；
- pnpm 11（执行 `npm install -g pnpm@11.9.0` 安装）。

检查安装是否成功：

```bash
python --version
uv --version
node --version
pnpm --version
```

### 2. 获取项目并安装依赖

进入仓库根目录后执行：

```bash
uv sync --directory backend
pnpm --dir frontend install --frozen-lockfile
```

如果电脑上安装了 GNU Make，也可以用 `make setup` 代替上面两条命令；Windows 用户不需要额外安装 Make。

### 3. 配置模型服务

先复制配置模板。

Windows PowerShell：

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

macOS / Linux：

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

打开 `backend/.env`，填写自己的 OpenAI 兼容服务信息：

```dotenv
OPENAI_API_KEY=your-api-key
OPENAI_API_BASE=https://your-compatible-api.example.com/v1
OPENAI_MODEL=qwen3.5-plus
DEMO_AGENT_MODE=auto
```

说明：

- `OPENAI_API_BASE` 必须以该服务提供的 OpenAI 兼容 `/v1` 地址结尾；
- `OPENAI_MODEL` 必须是该 API Key 实际可以调用的模型；
- `auto` 会在模型或网络异常时回退到演示数据，并在页面显示 `HYBRID MODE`；
- 没有 API Key 也能查看固定演示流程，但不会生成真实的 Agent 结果；
- 不要把包含真实 API Key 的 `backend/.env` 提交到 Git。

前端默认配置如下，通常不需要修改：

```dotenv
VITE_API_URL=http://127.0.0.1:8000/agent
VITE_API_BASE=http://127.0.0.1:8000/api
```

### 4. 启动开发环境

需要打开两个终端，并保持两个终端都在运行。

终端 1：启动后端。

```bash
cd backend
uv run uvicorn app.main:app --app-dir src --host 127.0.0.1 --port 8000 --reload
```

终端 2：从仓库根目录启动前端。

```bash
pnpm --dir frontend dev
```

然后访问：

- 前端：http://127.0.0.1:5173
- 后端健康检查：http://127.0.0.1:8000/health
- API 文档：http://127.0.0.1:8000/docs

停止项目时，在两个终端中分别按 `Ctrl + C`。

### 5. 启动生产构建

先构建前端：

```bash
pnpm --dir frontend build
```

启动后端：

```bash
cd backend
uv run uvicorn app.main:app --app-dir src --host 127.0.0.1 --port 8000
```

另开一个终端启动构建后的前端。

Windows PowerShell：

```powershell
$env:HOST="127.0.0.1"
$env:PORT="5173"
pnpm --dir frontend start
```

macOS / Linux：

```bash
HOST=127.0.0.1 PORT=5173 pnpm --dir frontend start
```

### 常见问题

- 页面显示 `NetworkError`：通常是后端没有启动，先访问 `/health` 检查；
- 页面显示 `HYBRID MODE`：模型调用失败或超时，检查 API Key、兼容地址和模型名；
- `5173` 或 `8000` 端口被占用：关闭旧的开发进程后重新启动；
- 修改 `.env` 后没有生效：停止并重新启动后端；
- 旧任务仍显示旧模型或混合模式：任务会保存创建时的状态，请新建一次测绘验证新配置。

启动后可以使用首页预填的“Agent 系统设计”样例走完整个演示流程。

## 当前 API

Demo 主链路提供：

```text
POST  /api/runs
GET   /api/runs/{run_id}
POST  /api/runs/{run_id}/clarifications
PATCH /api/runs/{run_id}/plan
POST  /api/runs/{run_id}/plan/confirm
POST  /api/runs/{run_id}/retry
GET   /api/runs/{run_id}/events
GET   /api/runs/{run_id}/atlas
PATCH /api/runs/{run_id}/progress/{concept_id}
POST  /api/runs/{run_id}/assessments/{assessment_id}
GET   /api/demo/fixture
GET   /health
```

原有聊天原型继续提供：

```text
POST /agent
Content-Type: application/json
Response: text/event-stream
```

请求体使用 AI SDK 消息格式，并至少包含一条用户消息：

```json
{
  "messages": [
    {
      "role": "user",
      "content": "What's 15 + 27 + 8?",
      "parts": [
        {
          "type": "text",
          "text": "What's 15 + 27 + 8?"
        }
      ]
    }
  ]
}
```

响应包含文本增量和结束事件；工具调用协议保留给后续研究和构建阶段。

## 检查与测试

不依赖 Make 的跨平台命令：

```bash
uv run --directory backend pytest -q
uv run --directory backend ruff check .
pnpm --dir frontend typecheck
pnpm --dir frontend build
```

安装了 GNU Make 时也可以执行 `make test`。当前检查包括后端单元测试、Ruff 检查、前端 TypeScript 类型检查和生产构建。

## 项目结构

```text
.
├── backend/
│   ├── src/app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── schemas/
│   │   ├── streaming/
│   │   ├── workflow/
│   │   ├── store.py
│   │   └── main.py
│   ├── data/runs/        # 本地 Demo 任务数据，不提交 Git
│   └── tests/
├── frontend/
│   ├── app/routes/       # 创建、计划、进度和 Atlas 页面
│   └── app/lib/          # API 与轮询逻辑
├── docs/
│   └── adr/
├── CHANGELOG.md
└── Makefile
```

## 项目文档

- [产品定义与边界](docs/PRODUCT.md)
- [开发路线图](docs/ROADMAP.md)
- [当前进度](docs/STATUS.md)
- [系统架构](docs/ARCHITECTURE.md)
- [项目文档与进度管控方式](docs/PROJECT_CONTROL.md)
- [版本变更记录](CHANGELOG.md)
