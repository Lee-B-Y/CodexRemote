param([ValidateSet('bridge','tunnel')][string]$Role)
$ErrorActionPreference='Stop'
$settings=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'private\settings.json') -Raw | ConvertFrom-Json
$failures=0
$log=Join-Path $PSScriptRoot ('private\logs\launcher-'+$Role+'.log')
New-Item -ItemType Directory -Path (Split-Path $log) -Force | Out-Null
while($true){
  $started=Get-Date
  if((Test-Path $log) -and (Get-Item $log).Length -gt 2MB){Move-Item -LiteralPath $log -Destination ($log+'.previous') -Force}
  try{
    & $settings.node (Join-Path $PSScriptRoot 'supervisor.mjs') $Role >> $log 2>&1
    $result=$LASTEXITCODE
  }catch{$result=-1;Add-Content -LiteralPath $log -Value $_.Exception.Message}
  Add-Content -LiteralPath $log -Value ((Get-Date).ToUniversalTime().ToString('o')+" supervisor exited: $result")
  if(((Get-Date)-$started).TotalSeconds -gt 120){$failures=0}else{$failures++}
  Start-Sleep -Seconds ([int][Math]::Min(60,[Math]::Pow(2,[Math]::Min($failures,6))))
}
