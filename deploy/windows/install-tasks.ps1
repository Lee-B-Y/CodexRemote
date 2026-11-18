$ErrorActionPreference='Stop'
$account=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
if([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value -in @('S-1-5-18','S-1-5-19','S-1-5-20')){throw 'Install under the interactive Desktop user, not a service account'}
$launcher=Join-Path $PSScriptRoot 'launch-hidden.vbs'
$hostPath=Join-Path $env:SystemRoot 'System32\wscript.exe'
if(-not (Test-Path -LiteralPath $hostPath)){throw 'Windows Script Host is unavailable; do not replace it with a visible console host'}
foreach($key in @('HKCU:\Software\Microsoft\Windows Script Host\Settings','HKLM:\Software\Microsoft\Windows Script Host\Settings')){
  if((Get-ItemProperty -Path $key -Name Enabled -ErrorAction SilentlyContinue).Enabled -eq 0){throw 'Windows Script Host is disabled by policy; do not change security policy'}
}
$principal=New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
$trigger=@(
  (New-ScheduledTaskTrigger -AtLogOn -User $account),
  (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1))
)
# IgnoreNew skips the periodic trigger while healthy; it also restores a killed launcher.
$options=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -Hidden
foreach($role in @('bridge','tunnel')){
  $name='CodexRemote-'+$role
  $existing=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if($existing){throw "Task already exists: $name; inspect before replacing"}
  $arguments='//B //Nologo "'+$launcher+'" '+$role
  $action=New-ScheduledTaskAction -Execute $hostPath -Argument $arguments -WorkingDirectory (Split-Path (Split-Path $PSScriptRoot))
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $options -Description "CodexRemote $role; interactive login only; dedicated reverse tunnel" | Out-Null
}
