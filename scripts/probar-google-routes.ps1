# Prueba la clave de Google Maps contra la Routes API (la misma llamada que hace el backend).
# Uso, desde cmd o PowerShell:  powershell -ExecutionPolicy Bypass -File scripts\probar-google-routes.ps1
$key = Read-Host "Pega aqui la GOOGLE_MAPS_API_KEY y presiona Enter"
$body = @{
  origin      = @{ location = @{ latLng = @{ latitude = 18.4735; longitude = -69.9406 } } }
  destination = @{ location = @{ latLng = @{ latitude = 18.5601; longitude = -68.3725 } } }
  travelMode = "DRIVE"; routingPreference = "TRAFFIC_AWARE"; languageCode = "es-419"; units = "METRIC"
} | ConvertTo-Json -Depth 6
try {
  $r = Invoke-RestMethod "https://routes.googleapis.com/directions/v2:computeRoutes" -Method Post -ContentType "application/json" `
    -Headers @{ "X-Goog-Api-Key" = $key.Trim(); "X-Goog-FieldMask" = "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline" } -Body $body
  $km = $r.routes[0].distanceMeters / 1000
  $min = [int]($r.routes[0].duration -replace 's','') / 60
  Write-Host ("OK: {0:N1} km, {1:N0} min (Av. Lincoln -> Bavaro), polilinea de {2} caracteres" -f $km, $min, $r.routes[0].polyline.encodedPolyline.Length) -ForegroundColor Green
} catch {
  Write-Host "FALLO:" -ForegroundColor Red
  if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message } else { Write-Host $_.Exception.Message }
}
