# Remove bracketed dynamic route folders that conflict with new routes
param(
    [switch]$WhatIf
)

$base = Join-Path -Path $PSScriptRoot -ChildPath '..\src\app\api\rapidoc\beneficiaries'
$paths = @(
    Join-Path $base '[cpf]'
    Join-Path $base '[uuid]'
)

foreach ($p in $paths) {
    if (Test-Path $p) {
        if ($WhatIf) {
            Write-Host "Would remove: $p"
        } else {
            Write-Host "Removing: $p"
            Remove-Item -LiteralPath $p -Recurse -Force
        }
    } else {
        Write-Host "Not found: $p"
    }
}

Write-Host "Done. If you removed folders, run 'pnpm dev' or 'npm run dev' to restart Next.js." 
