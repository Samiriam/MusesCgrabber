# Script de build para Score Grabber
# Concatena pdfmake + vfs_fonts + content.js en un solo archivo

$src = "src"
$dist = "dist"

# Limpiar carpeta dist
if (Test-Path $dist) { Remove-Item -Recurse -Force $dist }
New-Item -ItemType Directory -Path $dist | Out-Null

# Copiar archivos que no necesitan build
Copy-Item "$src\manifest.json" $dist\
Copy-Item "$src\background\background.js" $dist\
Copy-Item "$src\popup\popup.html" $dist\
Copy-Item "$src\popup\popup.css" $dist\
Copy-Item "$src\popup\popup.js" $dist\
Copy-Item "$src\sandbox\sandbox.html" $dist\
Copy-Item "$src\sandbox\sandbox.js" $dist\
Copy-Item "$src\content\content.css" $dist\

# Concatenar content.js con pdfmake
$pdfmake = Get-Content "$src\pdfmake.min.js" -Raw
$vfs = Get-Content "$src\vfs_fonts.js" -Raw
$content = Get-Content "$src\content\content.js" -Raw

# Crear content.js final con pdfmake incluido
$buildContent = @"
// pdfmake.min.js
$pdfmake

// vfs_fonts.js
$vfs

// content.js
$content
"@

Set-Content -Path "$dist\content.js" -Value $buildContent -Encoding UTF8

Write-Host "Build completado!"
Write-Host "Archivos en dist/"
Get-ChildItem $dist | Select-Object Name, Length
