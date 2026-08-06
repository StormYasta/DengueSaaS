@echo off
setlocal
cd /d "%~dp0"

echo.
echo ================================================
echo   DengueSaaS - Modo Feira com dados simulados
echo ================================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERRO] O Node.js / npm nao foi encontrado neste notebook.
    echo Instale o Node.js ou execute o build em outro computador.
    echo.
    pause
    exit /b 1
)

if not exist "apps\web\package.json" (
    echo [ERRO] Este arquivo deve ficar na raiz do repositorio DengueSaaS.
    echo Nao foi encontrado: apps\web\package.json
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0apps\web"

if not exist "node_modules" (
    echo Instalando as dependencias do frontend...
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERRO] Nao foi possivel instalar as dependencias.
        pause
        exit /b 1
    )
)

echo.
echo Dashboard disponivel em:
echo.
echo   http://localhost:5173
echo.
echo Para abrir em outro aparelho da mesma rede:
echo.
echo   http://IP_DO_NOTEBOOK:5173
echo.
echo Mantenha esta janela aberta durante a demonstracao.
echo Para encerrar, pressione CTRL+C.
echo.

start "" "http://localhost:5173"

call npm run dev:local -- --port 5173 --strictPort

echo.
pause
