@echo off
echo ==========================================
echo   STREAMFORGE - SISTEMA PORTABLE
echo ==========================================
echo.
echo Verificando dependencias...
if not exist "backend\node_modules" (
    echo [AVISO] Instalando dependencias do Backend...
    cd backend && call npm install && npx prisma migrate dev --name init && cd ..
)
if not exist "frontend\node_modules" (
    echo [AVISO] Instalando dependencias do Frontend...
    cd frontend && call npm install --force && cd ..
)

echo.
echo [1/2] Iniciando Backend (API + Worker)...
start "StreamForge Backend" /D "backend" cmd /k "npm run dev"

echo.
echo [2/3] Iniciando Nexus (Deep Search Engine)...
start "StreamForge Nexus" /D "nexus" cmd /k "npm start"

echo.
echo [3/4] Iniciando Torrent Gateway (Stream V2)...
start "StreamForge Gateway" /D "backend" cmd /k "npm run gateway"

echo.
echo [4/4] Iniciando Frontend (React/Vite)...
start "StreamForge Frontend" /D "frontend" cmd /k "npm run dev"

echo.
echo [SISTEMA INICIADO]
echo - Backend: http://localhost:3000
echo - Frontend: http://localhost:5173
echo.
echo Pode fechar esta janela, mas mantenha as outras duas abertas.
pause
