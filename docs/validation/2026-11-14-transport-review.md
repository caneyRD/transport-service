# Verificación de Transporte — 14 noviembre 2026

Alcance: backend, API y persistencia PostgreSQL; no certifica frontend, despliegue productivo, carga ni integraciones externas completas.

## Resultado

70 pruebas exitosas en 19 suites, incluyendo integración con PostgreSQL por VPN, rollback de fixtures, controles de propietario/asignación, eventos transaccionales y reintentos. Compilación TypeScript, lint y git diff --check correctos. Las pruebas no constituyen garantía de ausencia absoluta de errores.

Durante esta revisión se reprodujeron y corrigieron dos fallos:

- GPS: numeric(9,6) redondeaba coordenadas con más de seis decimales y un reintento idéntico se interpretaba como datos distintos. La persistencia ahora normaliza coordenadas a seis decimales antes de comparar, guardar y emitir el evento. La prueba usa coordenadas de ocho decimales.
- Disponibilidad: modificar una parte de una ventana eliminaba también sus tramos externos. Ahora se preservan los fragmentos anterior y posterior dentro de la misma transacción. La prueba comprueba los tres tramos.

## Cronograma

Fuente: outputs/cronograma-2026-11-14/BANEY_Cronograma_ACTUALIZADO_2026-11-14.xlsx, hoja 04 Casos de Uso. Se cuentan IDs calendarizados de Transporte, sin duplicar la vista 07 F1 Casos Completo.

| Tramo | Implementados | Total | Situación al 14 noviembre |
| --- | ---: | ---: | --- |
| Sprint 3, 19 octubre–1 noviembre | 7 | 7 | Completo backend |
| Sprint 4, 2–15 noviembre | 6 | 6 | Completo backend, un día antes del cierre |
| Sprint 5, 16–29 noviembre | 5 | 9 | 55,6 % anticipado |
| Sprints posteriores | 17 | 73 | Avance parcial; no son sprints completos |
| Total Transporte | 35 | 95 | 36,8 % implementado; 60 pendientes |

La meta de reducir de 82 a 60 pendientes se alcanzó el 14 noviembre, tres días antes del martes 17 noviembre. Hay 22 casos futuros adelantados respecto a los 13 exigibles hasta el cierre del sprint 4. No es correcto convertirlos en un adelanto global de meses: quedan huecos en los sprints siguientes.

Prioridad inmediata del sprint 5: UC-TRA-20 (KYC), UC-TRA-25 (notificación de solicitud cercana), UC-TRA-26 (aceptar/rechazar solicitud) y UC-TRA-27 (contraoferta del transportista). Rutas y distancias actuales son estimaciones geodésicas, no navegación vial. Los estados Implementado backend no acreditan frontend ni QA cruzado.
