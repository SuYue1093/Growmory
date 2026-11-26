@echo off
chcp 65001 >nul
title Growmory - 重启服务

:: 切换到项目根目录
cd /d "%~dp0.."

echo ========================================================
echo               Growmory 服务重启 (Windows)
echo ========================================================
echo.

:: 1. 查找并停止 5173 / 6173 端口占用
set FOUND_OLD=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    set FOUND_OLD=1
    echo 检测到端口 5173 被占用 (PID: %%a)，正在停止旧服务……
    taskkill /F /PID %%a >nul 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":6173" ^| findstr "LISTENING"') do (
    set FOUND_OLD=1
    echo 检测到端口 6173 被占用 (PID: %%a)，正在停止旧服务……
    taskkill /F /PID %%a >nul 2>nul
)
if %FOUND_OLD% equ 0 (
    echo 未检测到运行中的旧服务进程。
) else (
    echo 旧服务已停止。
)

:: 等待端口彻底释放
timeout /t 1 /nobreak >nul

:: 2. 检查 Node.js 环境
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 24.11 或以上版本。
    pause
    exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未找到 npm，请检查 Node.js 安装。
    pause
    exit /b 1
)

node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 24 || (major === 24 && minor >= 11) ? 0 : 1)"
if %errorlevel% neq 0 (
    for /f "tokens=*" %%v in ('node -v') do set NODE_VERSION=%%v
    echo [错误] 当前 Node.js 版本为 %NODE_VERSION%，需要 24.11 或以上版本。
    pause
    exit /b 1
)

:: 3. 检查依赖
if not exist "node_modules\" (
    echo [提示] 检测到缺少依赖包，正在自动安装……
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败，请检查网络连接后重试。
        pause
        exit /b 1
    )
)

:: 4. 内存配置与重启服务
if not defined NODE_OPTIONS (
    set NODE_OPTIONS=--max-old-space-size=4096
)

echo.
echo 正在重新启动 Growmory 服务……
echo 启动完成后，请在浏览器中访问 http://localhost:5173
echo 停止服务请按 Ctrl + C。
echo.

call npm run dev
if %errorlevel% neq 0 (
    echo.
    echo [错误] 服务运行异常，请检查上方报错信息。
    pause
    exit /b 1
)
