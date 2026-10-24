# Base de datos unificada de BANEY

Este paquete crea una base PostgreSQL única para los módulos existentes de Baney y la propuesta del dominio. Incluye el servicio Transporte del repositorio. La versión generada contiene 161 tablas, 294 relaciones FK y 6 vistas.

## Archivos

- `schema.sql`: baseline completo, ejecutable en una base vacía.
- `baney-completo.drawio`: diagrama diagrams.net con mapa de módulos, una hoja ERD global (161 tablas, columnas y 294 relaciones, más un índice de relaciones en el panel derecho) y pestañas de detalle por esquema.
- `DATA_DICTIONARY.md`: columnas, tipos, restricciones, índices y vistas.
- `relationships.csv`: inventario de relaciones físicas.
- `compose.yaml`: arranque local, construye la imagen desde `Dockerfile`.
- `compose.dokploy.yaml`: variante para Dokploy, usa la imagen oficial y configs locales del paquete.
- `sources/`, `modules.sql`, `integrity.sql`, `tools/`: fuentes y generadores del baseline.

Las tablas provenientes de los SQL existentes se consolidan por esquema. Los módulos `identity`, `profiles`, `payments`, `communications`, `support`, `governance`, `education` y `analytics` son diseño propuesto a partir de la definición del dominio; hay que revisarlos con Arquitectura antes de usarlos como contratos productivos.

## Despliegue en Dokploy

1. Copia la carpeta completa `database/unified` al servidor o a un repositorio privado accesible por Dokploy. No subas contraseñas.
2. En Dokploy crea un servicio Compose apuntando a esa carpeta y selecciona `compose.dokploy.yaml`.
3. Define `POSTGRES_PASSWORD` y `BANEY_APP_PASSWORD` como variables secretas distintas, largas y aleatorias. Opcionalmente define `POSTGRES_DB`, `POSTGRES_USER` y `BANEY_NETWORK_NAME`.
4. Despliega y espera a que el healthcheck quede en estado saludable.

La base escucha solo en la red interna de Compose. No se publica el puerto 5432. Conecta los servicios por la red `baney-private` y usa la base indicada por `POSTGRES_DB`, el usuario de aplicación `baney_app` y `BANEY_APP_PASSWORD`. Si otros servicios Docker necesitan acceder a esa red, conéctalos explícitamente a la misma red privada desde Dokploy.

## Inicio local

Desde esta carpeta, copia `.env.example` a `.env`, reemplaza ambos valores de contraseña y ejecuta:

```sh
docker compose --env-file .env up -d --build
docker compose --env-file .env ps
```

`schema.sql` y el script de creación del rol se ejecutan solo cuando PostgreSQL inicializa un volumen vacío. Para volver a crear desde cero en desarrollo local, detén el servicio y elimina el volumen `baney_data`; esto borra sus datos.

## Regeneración y validación

Desde la raíz del repositorio, con Python, Node.js y las dependencias del proyecto instaladas:

```sh
python database/unified/tools/build_schema.py
node database/unified/tools/validate.mjs
python database/unified/tools/build_artifacts.py
```

La validación ejecuta el baseline con PGlite, inspecciona el catálogo y corre las pruebas de integridad. Requiere acceso a la red para descargar el runtime de PGlite si no está en caché.

## Alcance de los datos

Este baseline crea estructura y restricciones, no migra los datos de las bases originales. No incluye usuarios demo, hashes, credenciales de proveedores ni claves fiscales. La migración de datos y la revisión de los módulos propuestos son pasos separados antes de conectar tráfico real.
