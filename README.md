# CanvasDriven

Voice-ready, canvas-driven architecture workspace MVP.

## Stack

- Backend: Python, FastAPI, LangGraph state definitions, Pydantic, uv
- Frontend: React, TypeScript, Vite, React Flow, Zustand

## Run Backend

```powershell
cd backend
uv sync
uv run uvicorn canvasdriven.main:app --reload --host 127.0.0.1 --port 8000
```

## Run Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5174`.

## Start Both

```powershell
.\start.ps1
```

If a stale process is holding a port:

```powershell
.\start.ps1 -Restart
```

To open the browser after startup:

```powershell
.\start.ps1 -OpenBrowser
```

## LLM Config

Edit `config/llm.local.json` once and restart the backend:

```json
{
  "provider": "openai_compatible",
  "apiMode": "chat_completions",
  "model": "deepseek-chat",
  "baseUrl": "https://api.deepseek.com",
  "apiKey": "your-api-key"
}
```

`config/llm.local.json` is ignored by git. Keep `config/llm.local.example.json` as the shareable template.

## 随机照片二维码

固定入口：<https://canvas.singularitynear.com/qrcode>。每次打开或刷新随机显示一张照片，允许连续抽到同一张；无需登录。

二维码 PNG：[下载二维码](docs/qrcode.png)。黑白图片包含白色留边，可用于打印；打印时保留留边。

默认照片目录为项目根目录下的 `data/qrcode-images`（已由 `.gitignore` 中的 `data/` 排除）。创建目录并放入照片即可，也可在启动后端前配置绝对路径：

```powershell
$env:QRCODE_IMAGE_DIR = 'D:\canvas-photos'
```

Linux 服务器：

```bash
export QRCODE_IMAGE_DIR=/srv/canvas-photos
```

仅扫描目录第一层的 JPG、JPEG、PNG、WebP、GIF 文件（扩展名不区分大小写），忽略子目录和符号链接。文件必须是对应格式的有效图片。增删照片会在下一次请求生效，不用重启；修改环境变量需要重启后端。上传时建议先使用 `.tmp` 扩展名，完成后再重命名为图片文件，避免读取上传中的内容。该目录的照片均为公开展示内容。

没有可用照片时返回 HTTP 404 和“暂无可展示的照片”；读取失败返回 HTTP 503 和友好提示。图片在发送前读入内存，建议使用适合手机查看的压缩照片。

本地启动前后端后，访问 <http://127.0.0.1:5174/qrcode>。重新生成固定二维码：

```powershell
cd frontend
npm run generate:qrcode
```

部署检查：

- FastAPI 已在前端兜底路由之前注册 `/qrcode`。如果反向代理单独托管前端，必须将 `/qrcode` 转发给 FastAPI，例如 Nginx 的 `location = /qrcode { proxy_pass http://127.0.0.1:8000; proxy_cache off; }`（按实际后端地址调整）。
- 响应设置 `Cache-Control: no-store`；CDN 应为 `/qrcode` 配置绕过缓存，移除旧缓存及强制缓存规则。
- 确保后端进程有照片目录的读取权限。容器部署将服务器照片目录挂载到容器，例如 `-v /srv/canvas-photos:/photos:ro -e QRCODE_IMAGE_DIR=/photos`，避免重建容器丢失照片。
- 发布后检查 `/qrcode` 的图片内容、`Content-Type` 和 `Cache-Control`；用手机扫描 PNG 确认打开固定 HTTPS 地址，再检查首页绘图功能。

## Tests

```powershell
cd backend
uv run pytest

cd ..\frontend
npm test -- --run
```
