
# DomainAtlas

DomainAtlas 是一个知识地图式的领域学习 Agent，帮助用户在有限时间内建立对陌生领域的第一版结构化认知。

> **当前状态：早期技术原型。**
> 当前仓库已实现流式对话和 Agent 工具调用链路，尚不能生成完整的 Atlas。

## 当前能力

- FastAPI 后端和 React Router 前端；
- `POST /agent` 流式聊天接口；
- AI SDK 消息到 Pydantic-AI 消息的转换；
- 基于 SSE 的文本流；
- 基础请求校验、后端测试、Ruff 检查和 TypeScript 检查；
- 面向陌生领域的范围校准与结构化学习框架对话原型。

当前实现仍处于 M0/M1 过渡阶段，尚未生成完整的 Atlas。

## 快速开始

### 环境要求

- Python 3.12+
- uv
- Node.js 22+
- pnpm
- GNU Make

### 安装与配置

```bash
make setup
cp backend/.env.example backend/.env
```

在 `backend/.env` 中填写模型服务配置：

```dotenv
OPENAI_API_KEY=your-api-key

# 可选：支持流式工具调用的 OpenAI 兼容服务
OPENAI_API_BASE=https://your-compatible-api.example.com/v1

# 模型名称；需要与所选服务中可用的模型一致
OPENAI_MODEL=deepseek-v4-flash
```

如需修改前端请求地址，创建 `frontend/.env`：

```dotenv
VITE_API_URL=http://127.0.0.1:8000/agent
```

### 启动

```bash
make dev
```

默认地址：

- 前端：http://localhost:5173
- 后端：http://127.0.0.1:8000
- API 文档：http://127.0.0.1:8000/docs

也可以分别启动：

```bash
uv run --directory backend fastapi dev src/app/main.py
pnpm --dir frontend dev
```

启动后，可以在前端输入以下内容，验证领域学习对话和流式响应链路：

```text
I want to understand climate policy. I am a software engineer, have two hours, and want a map of the main mechanisms and trade-offs.
```

## 当前 API

后端目前提供：

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

```bash
make test
```

也可以分别执行：

```bash
make test-backend
make test-frontend
```

当前检查包括后端单元测试、Ruff 检查和前端 TypeScript 类型检查。

## 项目结构

```text
.
├── backend/
│   ├── src/app/
│   │   ├── api/
│   │   ├── agent/
│   │   ├── core/
│   │   ├── schemas/
│   │   ├── streaming/
│   │   └── main.py
│   └── tests/
│       ├── test_message_conversion.py
│       ├── test_models.py
│       └── test_stream_protocol.py
├── frontend/
│   └── app/
├── docs/
└── Makefile
```

## 项目文档

- [产品定义与边界](docs/PRODUCT.md)
- [开发路线图](docs/ROADMAP.md)
- [当前进度](docs/STATUS.md)
- [系统架构](docs/ARCHITECTURE.md)
- [项目文档与进度管控方式](docs/PROJECT_CONTROL.md)
