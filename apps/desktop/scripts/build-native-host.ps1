$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '..\src-tauri\native\PetLink.NativeHost.cs'
$output = Join-Path $PSScriptRoot '..\src-tauri\native\PetLink.NativeHost.exe'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'

if (-not (Test-Path -LiteralPath $compiler)) {
  throw 'Windows .NET Framework C# compiler was not found.'
}

function Find-FrameworkAssembly([string]$name) {
  $referenceRoot = Join-Path ${env:ProgramFiles(x86)} 'Reference Assemblies\Microsoft\Framework\.NETFramework'
  if (Test-Path -LiteralPath $referenceRoot) {
    $reference = Get-ChildItem -LiteralPath $referenceRoot -Filter $name -Recurse -File | Select-Object -Last 1
    if ($reference) { return $reference.FullName }
  }
  $gacRoot = Join-Path $env:WINDIR 'Microsoft.NET\assembly'
  $gac = Get-ChildItem -LiteralPath $gacRoot -Filter $name -Recurse -File | Where-Object {
    $_.FullName -notmatch '\\resources\\' -and $_.FullName -notmatch '\\[a-z]{2}-[A-Z][a-z]\\'
  } | Select-Object -First 1
  if ($gac) { return $gac.FullName }
  throw "Required .NET Framework assembly was not found: $name"
}

$windowsBase = Find-FrameworkAssembly 'WindowsBase.dll'
$presentationCore = Find-FrameworkAssembly 'PresentationCore.dll'
$presentationFramework = Find-FrameworkAssembly 'PresentationFramework.dll'
$systemXaml = Find-FrameworkAssembly 'System.Xaml.dll'

& $compiler /nologo /target:winexe /optimize+ /platform:anycpu /out:$output `
  /reference:$windowsBase `
  /reference:$presentationCore `
  /reference:$presentationFramework `
  /reference:$systemXaml `
  $source

if ($LASTEXITCODE -ne 0) { throw "Native pet host compilation failed with exit code $LASTEXITCODE." }
