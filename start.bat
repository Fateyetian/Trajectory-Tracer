@echo off
echo ======================================
echo   Trajectory Viewer - Quick Start
echo ======================================
echo.

REM 检查 Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Docker is not installed
    echo Please install Docker Desktop: https://www.docker.com/products/docker-desktop
    exit /b 1
)

REM 检查 Docker Compose
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Docker Compose is not installed
    exit /b 1
)

echo Docker and Docker Compose are installed
echo.

REM 检查数据集
if not exist "alfworld_expert_traj" (
    echo Warning: alfworld_expert_traj directory not found
    echo Please make sure the trajectory dataset is in the project root
    echo.
)

echo Starting services...
echo.

REM 构建并启动服务
docker-compose up -d --build

if %errorlevel% equ 0 (
    echo.
    echo ======================================
    echo   Services started successfully!
    echo ======================================
    echo.
    echo Frontend: http://localhost
    echo Backend:  http://localhost:8000
    echo API Docs: http://localhost:8000/docs
    echo.
    echo View logs:
    echo    docker-compose logs -f
    echo.
    echo Stop services:
    echo    docker-compose down
    echo.
) else (
    echo.
    echo Failed to start services
    echo Check logs with: docker-compose logs
    exit /b 1
)
