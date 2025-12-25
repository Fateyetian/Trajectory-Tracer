#!/bin/bash

echo "======================================"
echo "  Trajectory Viewer - Quick Start"
echo "======================================"
echo ""

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed"
    echo "Please install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

# 检查 Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Error: Docker Compose is not installed"
    echo "Please install Docker Compose first: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# 检查数据集
if [ ! -d "alfworld_expert_traj" ]; then
    echo "⚠️  Warning: alfworld_expert_traj directory not found"
    echo "Please make sure the trajectory dataset is in the project root"
    echo ""
fi

echo "🚀 Starting services..."
echo ""

# 构建并启动服务
docker-compose up -d --build

if [ $? -eq 0 ]; then
    echo ""
    echo "======================================"
    echo "  ✅ Services started successfully!"
    echo "======================================"
    echo ""
    echo "🌐 Frontend: http://localhost"
    echo "📡 Backend:  http://localhost:8000"
    echo "📚 API Docs: http://localhost:8000/docs"
    echo ""
    echo "📋 View logs:"
    echo "   docker-compose logs -f"
    echo ""
    echo "🛑 Stop services:"
    echo "   docker-compose down"
    echo ""
else
    echo ""
    echo "❌ Failed to start services"
    echo "Check logs with: docker-compose logs"
    exit 1
fi
