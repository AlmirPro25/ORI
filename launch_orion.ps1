# 🌌 Orion Launcher v1.0
# Este script inicia todo o ecossistema StreamForge + Orion Protocol

Write-Host "🚀 Iniciando Engine Orion..." -ForegroundColor Cyan

# 1. Verificar dependências (Simplificado)
if (!(Test-Path "node_modules")) {
    Write-Host "📦 Instalando dependências..." -ForegroundColor Yellow
    npm install
}

# 2. Iniciar Backend (onde o Orion reside)
Write-Host "🌐 Subindo Camada de Federação (Backend)..." -ForegroundColor Magenta
Start-Process powershell -ArgumentList "npm run dev" -WorkingDirectory "backend"

# 3. Iniciar Frontend (Painel de Controle)
Write-Host "🎨 Abrindo Dashboard Orion (Frontend)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "npm run dev" -WorkingDirectory "frontend"

Write-Host "✅ Sistema Ativado." -ForegroundColor Cyan
Write-Host "Acesse: http://localhost:5173/orion para gerenciar sua rede." -ForegroundColor Gray
