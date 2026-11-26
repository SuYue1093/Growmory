#!/bin/bash
set -euo pipefail

# 切换到项目根目录
cd "$(dirname "$0")/.."

fail() {
  echo "重启失败：$1"
  if [[ -t 0 ]]; then
    read -r -p "按回车键关闭窗口……" || true
  fi
  exit 1
}

echo "========================================"
echo "          Growmory 服务重启             "
echo "========================================"

# 1. 查找并停止正在运行的 Growmory 服务进程
echo "正在检测运行中的服务进程..."

# 使用 -sTCP:LISTEN 仅查找正在监听 5173 / 6173 端口的服务进程（避免误杀连接该端口的浏览器等客户端）
LISTEN_PIDS=$(lsof -ti :5173 -ti :6173 -sTCP:LISTEN 2>/dev/null || true)

# 查找运行当前项目 server/index.mjs 的 node 进程
SERVER_PIDS=$(pgrep -f "node.*server/index\.mjs" 2>/dev/null || true)

# 合并去重目标 PID
TARGET_PIDS=$(echo "${LISTEN_PIDS}" "${SERVER_PIDS}" | tr ' ' '\n' | sort -u | grep -v '^$' || true)

if [[ -n "$TARGET_PIDS" ]]; then
  PIDS_DISPLAY=$(echo $TARGET_PIDS | tr '\n' ' ')
  echo "检测到正在运行的服务进程 (PID: ${PIDS_DISPLAY})，正在优雅停止……"
  kill $TARGET_PIDS 2>/dev/null || true

  # 等待进程退出（最多等待 3 秒）
  for i in {1..30}; do
    REMAINING=$(lsof -ti :5173 -ti :6173 -sTCP:LISTEN 2>/dev/null || true)
    if [[ -z "$REMAINING" ]]; then
      break
    fi
    sleep 0.1
  done

  # 若仍有残留监听进程，则执行强制退出
  REMAINING=$(lsof -ti :5173 -ti :6173 -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "$REMAINING" ]]; then
    echo "进程未完全退出，正在强制清理 (PID: $(echo $REMAINING | tr '\n' ' '))……"
    kill -9 $REMAINING 2>/dev/null || true
    sleep 0.5
  fi
  echo "旧服务已成功停止。"
else
  echo "未检测到运行中的旧服务进程。"
fi

# 确保端口已彻底释放
for i in {1..20}; do
  if ! lsof -ti :5173 -sTCP:LISTEN >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

# 2. 检查 Node.js 与 npm 环境
command -v node >/dev/null 2>&1 || fail "请先安装 Node.js 24.11 或以上版本。"
command -v npm >/dev/null 2>&1 || fail "未找到 npm，请检查 Node.js 安装。"

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 24 || (major === 24 && minor >= 11) ? 0 : 1)' \
  || fail "当前 Node.js $(node -v)，需要 24.11 或以上版本。"

if [[ ! -d node_modules ]]; then
  echo "检测到缺少依赖，正在自动安装……"
  npm ci || fail "依赖安装失败，请检查网络后重试。"
fi

# 3. 设置 Node.js 堆内存（默认 4GB）
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

# 4. 重新启动服务
DAEMON_MODE=false
for arg; do
  if [[ "$arg" == "--daemon" || "$arg" == "-d" || "$arg" == "--background" ]]; then
    DAEMON_MODE=true
  fi
done

if [[ "$DAEMON_MODE" == "true" ]]; then
  mkdir -p .tmp
  echo "正在后台启动 Growmory 服务……"
  nohup npm run dev < /dev/null > .tmp/growmory.log 2>&1 &

  # 等待服务就绪并检测端口（最多 10 秒）
  READY=false
  for i in {1..50}; do
    if lsof -ti :5173 -sTCP:LISTEN >/dev/null 2>&1; then
      READY=true
      break
    fi
    sleep 0.2
  done

  if [[ "$READY" == "true" ]]; then
    NEW_PID=$(lsof -ti :5173 -sTCP:LISTEN 2>/dev/null | head -n 1)
    echo "Growmory 服务已在后台成功启动 (PID: $NEW_PID)！"
    echo "访问地址: http://localhost:5173"
    echo "查看日志: tail -f .tmp/growmory.log"
  else
    fail "后台启动超时或失败，请检查 .tmp/growmory.log"
  fi
else
  echo "正在启动 Growmory 服务……"
  echo "访问地址: http://localhost:5173"
  echo "停止服务请按 Control+C。"
  echo "----------------------------------------"
  npm run dev || fail "服务未能正常运行，请检查上方错误信息。"
fi
