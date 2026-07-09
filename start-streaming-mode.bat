@echo off
echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║                                                           ║
echo ║   🎬 INICIANDO SISTEMA EM MODO STREAMING                  ║
echo ║                                                           ║
echo ║   Modo: 100%% Streaming (sem downloads permanentes)       ║
echo ║   Limpeza: Automática a cada 30 minutos                  ║
echo ║                                                           ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.

REM Verificar se as pastas existem
if not exist "frontend" (
    echo ❌ Pasta frontend não encontrada!
    pause
    exit /b 1
)

if not exist "backend" (
    echo ❌ Pasta backend não encontrada!
    pause
    exit /b 1
)

if not exist "nexus" (
    echo ❌ Pasta nexus não encontrada!
    pause
    exit /b 1
)

echo 📦 Verificando dependências...
echo.

REM Verificar Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js não está instalado!
    echo    Baixe em: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js encontrado
node --version

echo.
echo 🚀 Iniciando serviços...
echo.

REM Iniciar Frontend
echo [1/4] 🎨 Iniciando Frontend (porta 5173)...
start "Frontend - Streaming Mode" cmd /k "cd frontend && npm run dev"
timeout /t 2 /nobreak >nul

REM Iniciar Torrent Gateway
echo [2/4] 🌐 Iniciando Torrent Gateway (porta 3333)...
start "Torrent Gateway - Streaming" cmd /k "cd backend && node torrent-gateway.mjs"
timeout /t 2 /nobreak >nul

REM Iniciar Backend
echo [3/4] ⚙️  Iniciando Backend (porta 3000)...
start "Backend - Streaming Mode" cmd /k "cd backend && npm run dev"
timeout /t 2 /nobreak >nul

REM Iniciar Nexus
echo [4/4] 🔍 Iniciando Nexus Search (porta 3005)...
start "Nexus Search Engine" cmd /k "cd nexus && node server.js"

echo.
echo ✅ Todos os serviços foram iniciados!
echo.
echo 📊 Status dos Serviços:
echo    Frontend:  http://localhost:5173
echo    Backend:   http://localhost:3000
echo    Gateway:   http://localhost:3333
echo    Nexus:     http://localhost:3005
echo.
echo 🎬 Modo Streaming Ativo:
echo    ✓ Sem downloads permanentes
echo    ✓ Limpeza automática a cada 30 min
echo    ✓ Economia de 80-90%% de banda
echo.
echo 💡 Dica: Aguarde 10-15 segundos para todos os serviços iniciarem
echo.
echo 🌐 Abra seu navegador em: http://localhost:5173
echo.
pause
