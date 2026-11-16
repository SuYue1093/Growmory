@echo off
chcp 65001 >nul
title Growmory

:: 切换到项目根目录
cd /d "%~dp0.."

echo ========================================================
echo               Growmory 一键启动 (Windows)
echo ========================================================
echo.

:: 1. 检查 Node.js 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 24.11 或以上版本。
    echo 官方下载: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. 检查 npm 是否可用
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 npm，请检查 Node.js 安装。
    echo.
    pause
    exit /b 1
)

:: 3. 检查 Node.js 版本是否 >= 24.11
node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 24 || (major === 24 && minor >= 11) ? 0 : 1)"
if %errorlevel% neq 0 (
    for /f "tokens=*" %%v in ('node -v') do set NODE_VERSION=%%v
    echo [错误] 当前 Node.js 版本为 %NODE_VERSION%，Growmory 需要 24.11 或以上版本（需要 Node.js 原生内置 SQLite 支持）。
    echo 请访问 https://nodejs.org/ 下载并升级 Node.js。
    echo.
    pause
    exit /b 1
)

:: 4. 首次启动检查 node_modules
if not exist "node_modules\" (
    echo [提示] 首次启动，正在安装依赖包，请稍候……
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败，请检查网络连接后重试。
        echo.
        pause
        exit /b 1
    )
)

:: 5. 检查并清理 5173 / 6173 端口占用
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    echo 检测到端口 5173 被占用 (PID: %%a)，正在自动清理……
    taskkill /F /PID %%a >nul 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":6173" ^| findstr "LISTENING"') do (
    echo 检测到端口 6173 被占用 (PID: %%a)，正在自动清理……
    taskkill /F /PID %%a >nul 2>nul
)

:: 6. 设置 Node.js 内存限制并启动服务
if not defined NODE_OPTIONS (
    set NODE_OPTIONS=--max-old-space-size=4096
)

echo.
echo 正在启动 Growmory 服务……
echo 启动完成后，请在浏览器中访问服务输出的地址 (默认 http://localhost:5173)
echo 停止服务请按 Ctrl + C。
echo.

call npm run dev
if %errorlevel% neq 0 (
    echo.
    echo [错误] 服务运行异常，请检查上方报错信息。
    pause
    exit /b 1
)
