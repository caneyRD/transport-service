# BANEY PostgreSQL Database

Repositorio exclusivo del esquema PostgreSQL unificado de BANEY. Incluye la baseline SQL, el Compose para PostgreSQL, el ERD de diagrams.net, el diccionario físico y las fuentes/generadores.

## Contenido

- `schema.sql`: inicializa las 161 tablas y 294 relaciones del baseline en una base PostgreSQL vacía.
- `compose.yaml`: despliegue local con imagen construida desde `Dockerfile`.
- `compose.dokploy.yaml`: alternativa que crea PostgreSQL desde el repo y carga el esquema en un volumen nuevo.
- `compose.migrate-existing.yaml`: migrador de una sola ejecución para instalar el esquema en un servicio PostgreSQL que ya creaste desde **Databases** en Dokploy.
- `baney-completo.drawio`: modelo entidad-relación completo. La pestaña `01 · ERD completo` contiene las tablas, sus columnas, líneas FK y el índice de relaciones en la parte derecha.
- `DATA_DICTIONARY.md` y `relationships.csv`: referencia de columnas y relaciones.
- `sources/`, `modules.sql`, `integrity.sql`, `tools/`, `tests/`: fuentes y utilidades de generación/validación.

Los esquemas `identity`, `profiles`, `payments`, `communications`, `support`, `governance`, `education` y `analytics` son una propuesta basada en la definición de dominio y requieren revisión del equipo antes de usarse como contrato productivo. El baseline crea estructura y restricciones; no migra datos de otras bases.

## Tu flujo: crear PostgreSQL desde Databases y aplicar el esquema

1. Crea y despliega PostgreSQL desde **Databases** en Dokploy. No habilites credenciales externas ni publiques el puerto para este paso.
2. En la pestaña **General**, copia de **Internal Credentials** el `Internal Host`, `Internal Port`, `Database Name`, `User` y `Password`. No compartas la contraseña por chat ni la pongas en GitHub.
3. Crea un proyecto **Compose** de Dokploy conectado a este repositorio y selecciona `compose.migrate-existing.yaml` como archivo Compose. Desactiva **Isolated Deployments** para este Compose, de modo que pueda alcanzar la red Dokploy compartida de PostgreSQL.
4. En **Environment** del Compose, crea `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER` y `DATABASE_PASSWORD` usando los valores internos que copiaste. Si tu red compartida tiene otro nombre, ajusta `DOKPLOY_NETWORK_NAME`.
5. Despliega el Compose. El contenedor espera a PostgreSQL, comprueba que la base esté vacía y aplica `schema.sql`. El migrador termina con código 0 al completar; que el contenedor quede detenido después es esperado.

El migrador se niega a aplicar el baseline si encuentra tablas/objetos de usuario o un registro de esquema inesperado. Si ya se aplicó antes, reconoce `platform.schema_versions` y no vuelve a crear las tablas. El esquema se aplica dentro de una transacción. El despliegue de esta app Compose se usa para ejecutar la migración; PostgreSQL sigue viviendo en el servicio separado creado en **Databases**.

Después, conecta los servicios de aplicación usando las credenciales que muestra el servicio PostgreSQL en Dokploy. Este migrador no crea usuarios ni modifica las credenciales del servicio.

## Alternativa: crear PostgreSQL directamente desde este repositorio

Si prefieres que Compose cree y administre también el contenedor PostgreSQL, crea un proyecto Compose conectado a este repositorio y selecciona `compose.dokploy.yaml`. Configura `POSTGRES_PASSWORD` y `BANEY_APP_PASSWORD` como secretos separados. Esta alternativa crea otra instancia independiente; no la uses si ya creaste PostgreSQL desde **Databases**.

## Si ya creaste PostgreSQL desde Databases en Dokploy

Esa instancia se puede conservar. Descarga sus credenciales desde Dokploy y ejecuta `schema.sql` contra la base vacía usando una terminal con `psql` o un cliente como DBeaver. Por ejemplo, en un equipo que tenga `psql` instalado:

```sh
psql "host=HOST_DE_DOKPLOY port=PUERTO dbname=baney user=USUARIO_ADMIN sslmode=require" -v ON_ERROR_STOP=1 -f schema.sql
```

Sustituye los valores por los datos reales de Dokploy; no los guardes en este repositorio. Confirma primero que la base esté vacía. `schema.sql` no debe ejecutarse sobre una base con tablas existentes.

También puedes aplicar el SQL directamente con `psql`; `compose.migrate-existing.yaml` automatiza ese flujo dentro de la red de Dokploy.

## Inicio local

Copia `.env.example` a `.env`, reemplaza ambos valores de contraseña con secretos distintos y ejecuta desde la raíz del repo:

```sh
docker compose --env-file .env up -d --build
docker compose --env-file .env ps
```

La inicialización ocurre una sola vez sobre un volumen vacío. Para detener sin borrar los datos:

```sh
docker compose --env-file .env down
```

## Seguridad y datos

No se incluyen credenciales reales ni datos de usuarios. No publiques `.env`. Guarda las variables de producción en la sección de secretos de Dokploy. El esquema representa una consolidación lógica y no realiza por sí mismo migración de datos productivos.
