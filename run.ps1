Set-ExecutionPolicy -Scope Process Bypass;
Write-Host -ForegroundColor Yellow -Object 'Running command ''& "C:\Program Files\nodejs\npx.ps1" electron .''';
& "C:\Program Files\nodejs\npx.ps1" electron .;
Write-Host -ForegroundColor Yellow -Object 'Process exited.';
Pause;