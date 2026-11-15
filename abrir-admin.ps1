$ErrorActionPreference = 'Stop'

function Test-LocalAdminPage {
  try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/session' -TimeoutSec 2 -UseBasicParsing
    return $response.StatusCode -eq 200 -and $response.Content.Contains('authenticated')
  } catch {
    return $false
  }
}

try {
  if (-not (Test-LocalAdminPage)) {
    $pythonCommand = Get-Command py -ErrorAction SilentlyContinue
    $pythonArgs = @("`"$PSScriptRoot\abrir_admin.py`"")
    if (-not $pythonCommand) {
      $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    }
    if (-not $pythonCommand) {
      throw 'No encuentro Python. Instala Python o abre el panel con la extensión Live Server de VS Code.'
    }

    Start-Process -FilePath $pythonCommand.Source -ArgumentList $pythonArgs -WorkingDirectory $PSScriptRoot -WindowStyle Hidden

    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
      Start-Sleep -Milliseconds 500
      if (Test-LocalAdminPage) {
        $ready = $true
        break
      }
    }
    if (-not $ready) {
      throw 'El servidor Python del panel no respondió en el puerto 3000. Cierra el servidor anterior y vuelve a abrir ABRIR_ADMIN.bat.'
    }
  }

  Start-Process 'http://127.0.0.1:3000/admin'
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
