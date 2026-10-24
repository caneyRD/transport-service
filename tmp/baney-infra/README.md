# baney-infra
Propuesta de modelo de datos para los tres módulos cuyo backend me corresponde
según la hoja `00 Equipo` del cronograma: **Mercado, Caja y Billing**.

6 esquemas · 63 tablas · 57 claves foráneas · 5 vistas. Cubre los 81 casos de
uso de `04 Casos de Uso` cuyo módulo es Mercado, Caja o Billing.

| Archivo | Esquema | Tablas | Módulo | Período |
|---|---|---|---|---|
| `01_catalog_service.sql` | `baney_catalog` | 14 | Mercado | 10 |
| `02_inventory_service.sql` | `baney_inventory` | 5 | Mercado | 10–12 |
| `03_cart_service.sql` | `baney_cart` | 6 | Mercado | 11 |
| `04_order_service.sql` | `baney_order` | 13 | Mercado | 11–12 |
| `05_billing_service.sql` | `baney_billing` | 13 | Billing | 13 |
| `06_caja_service.sql` | `baney_caja` | 12 | Caja | 14 |

## Formato de los archivos

6 scripts **independientes**, cada uno con su `CREATE DATABASE` y su
`USE`. Se pueden correr tal cual y en cualquier orden: ningún esquema depende
de otro, no hay una sola clave foránea que cruce de uno a otro.

Para migraciones de Flyway, hay que sacarles el
`CREATE DATABASE` y el `USE` (Flyway corre dentro del schema) y partirlos en
una carpeta por servicio. Tengo esa versión lista: dime y la subo.

Falta aparte el **bootstrap de usuarios**: un usuario de aplicación por
servicio que solo vea su schema y sin permisos de DDL. No lo incluí porque los
`GRANT` son tuyos como owner de DB, pero el diseño de seis esquemas pierde
sentido si un usuario único los ve todos — alguien hace un JOIN entre
`catalog` y `order` "porque funciona" y la frontera deja de existir el primer
día. 

