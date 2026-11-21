param(
  [string]$Hora = "20:00"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Bat = Join-Path $Root "scripts\backup-local.bat"
$TaskName = "PasegaBackupLocal"

$Action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$Bat`" --silent" -WorkingDirectory $Root
$Trigger = New-ScheduledTaskTrigger -Daily -At $Hora
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Respaldo diario de Supabase Pasega hacia PostgreSQL local (pgAdmin 4)" -Force | Out-Null

Write-Host "Tarea programada '$TaskName' creada correctamente."
Write-Host "Se ejecutara todos los dias a las $Hora (si la PC estaba apagada, corre al encender)."
