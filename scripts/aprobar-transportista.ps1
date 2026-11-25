# Aprueba (habilita) un transportista y sus camiones con los endpoints de administracion.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\aprobar-transportista.ps1
# Requisitos: el backend desplegado con /admin/* y tu cuenta con rol 'moderador' o 'superadmin'.
param(
  [string]$Carrier = "626debb7-d087-4474-bf95-e7f004857f8b",
  [string]$Base = "https://srv2122223.hstgr.cloud/api"
)
$ErrorActionPreference = "Stop"

function Fallo($e, $paso) {
  $status = $null
  try { $status = [int]$e.Exception.Response.StatusCode } catch {}
  $cuerpo = $e.ErrorDetails.Message
  Write-Host ""
  Write-Host "No se pudo: $paso (HTTP $status)" -ForegroundColor Red
  if ($cuerpo) { Write-Host $cuerpo -ForegroundColor DarkGray }
  if ($status -eq 403) { Write-Host "Tu cuenta no es moderador/superadmin. Ejecuta una vez en la base:  UPDATE baney.usuario SET rol='superadmin' WHERE email='TU-CORREO';" -ForegroundColor Yellow }
  if ($status -eq 404 -and $cuerpo -match "Route not found") { Write-Host "El servidor no tiene todavia /admin/*: falta desplegar la version nueva del backend." -ForegroundColor Yellow }
  if ($status -eq 401) { Write-Host "Correo, contrasena o codigo incorrectos, o el token vencio." -ForegroundColor Yellow }
  exit 1
}

# 1) Iniciar sesion con TU cuenta de administrador (la contrasena no se muestra ni se guarda)
$correo = Read-Host "Correo de tu cuenta administradora"
$segura = Read-Host "Contrasena" -AsSecureString
$clave = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
try {
  $login = Invoke-RestMethod "$Base/users/api/v1/auth/login?session=token" -Method Post -ContentType "application/json" -Body (@{ email = $correo; password = $clave } | ConvertTo-Json)
} catch { Fallo $_ "iniciar sesion" }
$clave = $null
if ($login.data) { $login = $login.data }
if ($login.mfa_required) {
  $codigo = Read-Host "Codigo de verificacion en dos pasos"
  try {
    $login = Invoke-RestMethod "$Base/users/api/v1/auth/mfa/verify?session=token" -Method Post -ContentType "application/json" -Body (@{ mfa_token = $login.mfa_token; code = $codigo } | ConvertTo-Json)
  } catch { Fallo $_ "verificar el codigo" }
  if ($login.data) { $login = $login.data }
}
$H = @{ Authorization = "Bearer $($login.access_token)" }
$T = "$Base/transport"

# 2) Habilitar el perfil del transportista
try {
  $perfil = Invoke-RestMethod "$T/admin/carriers/$Carrier/status" -Method Patch -Headers $H -ContentType "application/json" -Body '{"status":"habilitado"}'
} catch { Fallo $_ "habilitar el transportista" }
Write-Host "Transportista: $($perfil.status)" -ForegroundColor Green

# 3) Habilitar sus camiones
try { $detalle = Invoke-RestMethod "$T/admin/carriers/$Carrier" -Headers $H } catch { Fallo $_ "leer el detalle" }
if (-not $detalle.vehicles -or $detalle.vehicles.Count -eq 0) {
  Write-Host "No tiene camiones registrados: agrega uno en la app (Flota) y vuelve a ejecutar este script." -ForegroundColor Yellow
} else {
  foreach ($v in $detalle.vehicles) {
    if ($v.status -ne "habilitado") {
      try { $r = Invoke-RestMethod "$T/admin/vehicles/$($v.id)/status" -Method Patch -Headers $H -ContentType "application/json" -Body '{"status":"habilitado"}' } catch { Fallo $_ "habilitar el camion $($v.plate)" }
      Write-Host "Camion $($v.plate): $($r.status)" -ForegroundColor Green
    } else {
      Write-Host "Camion $($v.plate): ya estaba habilitado" -ForegroundColor Green
    }
  }
}
if ($detalle.missingDocuments -and $detalle.missingDocuments.Count -gt 0) {
  Write-Host "Aviso: le faltan documentos aprobados ($($detalle.missingDocuments -join ', ')). Para pruebas no bloquea." -ForegroundColor DarkYellow
}
Write-Host ""
Write-Host "Listo. Cierra sesion en la app y entra de nuevo como transportista; activa 'Disponible'." -ForegroundColor Cyan
