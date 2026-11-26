#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

fail() {
  echo "启动失败：$1"
  if [[ -t 0 ]]; then
    read -r -p "按回车键关闭窗口……" || true
  fi
  exit 1
}

command -v node >/dev/null 2>&1 || fail "请先安装 Node.js 24.11 或以上版本。"
command -v npm >/dev/null 2>&1 || fail "未找到 npm，请检查 Node.js 安装。"

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 24 || (major === 24 && minor >= 11) ? 0 : 1)' \
  || fail "当前 Node.js $(node -v)，需要 24.11 或以上版本。"

if [[ ! -d node_modules ]]; then
  echo "首次启动，正在安装项目依赖……"
  npm ci || fail "依赖安装失败，请检查网络后重试。"
fi

# 检查 5173 或 6173 端口是否有残留旧进程，自动清理以便顺利启动（使用 -sTCP:LISTEN 避免误伤浏览器客户端）
OCCUPIED_PIDS=$(lsof -ti :5173 -ti :6173 -sTCP:LISTEN 2>/dev/null || true)
if [[ -n "$OCCUPIED_PIDS" ]]; then
  echo "检测到端口 5173/6173 有旧进程在运行，正在自动清理……"
  kill -9 $OCCUPIED_PIDS 2>/dev/null || true
  sleep 1
fi

# 为 Node.js 分配充足堆内存（默认 4GB），保障多媒体素材处理流畅稳定
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

echo "正在启动 Growmory，访问地址见下方服务输出。"
echo "停止服务请按 Control+C。"
npm run dev || fail "服务未能正常运行，请检查上方错误信息。"
