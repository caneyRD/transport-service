# Base compartida BANEY

Esta rama adapta la persistencia al SQL entregado por el usuario, esquema `baney`.
El despliegue actual en Hostinger conserva su imagen y base anterior hasta la
activación explícitamente autorizada.

Esta versión usa `baney.solicitud_transporte` y las tablas relacionadas. Necesita
`DATABASE_URL` del rol `baney_transport` y el esquema compartido en versión 002.
Las respuestas de la API conservan los nombres y estados del dominio en inglés;
PostgreSQL guarda los nombres y estados canónicos en español. La disponibilidad
por ventanas y las versiones optimistas requieren la migración aditiva 002.
No ejecutar las migraciones antiguas de `transport.*` sobre esta base.

El baseline exacto y la migración 002 se administran en `caneyRD/baney-infra`,
carpeta `database/shared`. Las copias en este repositorio son fixtures verificables
para CI. GitHub Actions prueba el SQL real; no crea un esquema alternativo desde ORM.

El secreto `BANEY_DATABASE_URL` está en el entorno `production` de GitHub y en el
archivo privado del servicio en `/opt/baney/production/config/shared-db/`.
Nunca ponerlo en el frontend ni en archivos versionados. El overlay de infraestructura
inyecta las variables efectivas durante el despliegue aprobado.

Las referencias compartidas son reales: usuarios, pagos y documentos legales deben
existir antes de referenciarlos. Los datos legales/de negocio no se fabrican durante
el despliegue. La conectividad de base no sustituye la configuración de los proveedores
externos de pagos o correo.
