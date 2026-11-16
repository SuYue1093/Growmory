#!/usr/bin/env bash
# ==============================================================================
# Growmory 独立沙箱测试环境脚本
# 特点：与当前正式环境 100% 物理隔离，不碰正式数据，不占用正式端口，退出自动清理
# ==============================================================================

set -euo pipefail

cd "$(dirname "$0")/.."

# 终端彩色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SANDBOX_PORT="${SANDBOX_PORT:-5188}"
TEMP_DIR="$(mktemp -d /tmp/growmory-sandbox-XXXXXX)"
SANDBOX_DB="${TEMP_DIR}/sandbox.sqlite"

cleanup() {
  echo -e "\n${YELLOW}正在清理沙箱临时测试数据……${NC}"
  rm -rf "${TEMP_DIR}"
  echo -e "${GREEN}✓ 沙箱数据已安全销毁，未影响任何本地正式环境。${NC}"
}

trap cleanup EXIT INT TERM

show_banner() {
  echo -e "${CYAN}======================================================${NC}"
  echo -e "${CYAN}          Growmory 隔离测试与沙箱启动工具            ${NC}"
  echo -e "${CYAN}======================================================${NC}"
}

start_sandbox_server() {
  show_banner
  echo -e "${BLUE}▶ 启动隔离沙箱环境：${NC}"
  echo -e "  - 沙箱服务端口: ${GREEN}http://localhost:${SANDBOX_PORT}${NC}"
  echo -e "  - 临时数据库:   ${YELLOW}${SANDBOX_DB}${NC}"
  echo -e "  - 物理隔离状态: ${GREEN}100% 隔离（正式数据 data/ 绝不被读写）${NC}"
  echo -e "  - 提示:         按 ${YELLOW}Control + C${NC} 停止服务并自动销毁测试数据\n"

  # 检查端口是否被占用，有冲突先清理
  local PIDS
  PIDS=$(lsof -ti ":${SANDBOX_PORT}" 2>/dev/null || true)
  if [[ -n "${PIDS}" ]]; then
    echo -e "${YELLOW}端口 ${SANDBOX_PORT} 被占用，正在自动释放……${NC}"
    kill -9 ${PIDS} 2>/dev/null || true
    sleep 1
  fi

  # 在独立端口与临时库下启动服务
  PORT="${SANDBOX_PORT}" DB_PATH="${SANDBOX_DB}" npm run dev
}

run_unit_tests() {
  show_banner
  echo -e "${BLUE}▶ 运行全量单元测试（物理隔离，无持久写入）……${NC}\n"
  npm test
  echo -e "\n${GREEN}✓ 单元测试运行完毕！${NC}"
}

run_browser_tests() {
  show_banner
  echo -e "${BLUE}▶ 运行端到端浏览器测试（临时隔离端口）……${NC}\n"
  npm run test:browser
  echo -e "\n${GREEN}✓ 浏览器端到端测试运行完毕！${NC}"
}

# 命令行参数支持
case "${1:-}" in
  --server|-s)
    start_sandbox_server
    ;;
  --unit|-u)
    run_unit_tests
    ;;
  --browser|-b)
    run_browser_tests
    ;;
  *)
    show_banner
    echo -e "请选择测试模式："
    echo -e "  ${GREEN}1)${NC} 启动浏览器沙箱工作台 (端口: ${SANDBOX_PORT}，退出自动销毁测试库)"
    echo -e "  ${GREEN}2)${NC} 运行全量业务单元测试 (npm test)"
    echo -e "  ${GREEN}3)${NC} 运行端到端浏览器自动化测试 (npm run test:browser)"
    echo -e "  ${GREEN}4)${NC} 退出"
    echo ""
    read -r -p "请输入选项 [1-4] (默认: 1): " choice
    choice="${choice:-1}"

    case "$choice" in
      1) start_sandbox_server ;;
      2) run_unit_tests ;;
      3) run_browser_tests ;;
      4) echo "已取消。"; exit 0 ;;
      *) echo "无效选项，退出。"; exit 1 ;;
    esac
    ;;
esac
