# Migración a Appwrite

El catálogo y las imágenes tienen una tabla y un bucket de Appwrite. La carpeta `supabase/` no se puede retirar todavía: las finanzas, la actividad, la recuperación de contraseña y la reserva de stock siguen usando esas tablas en el código actual.

## Tabla para los datos internos de la tienda

En la base de datos Appwrite `6afc0156001d3dd77b2e`, crea una tabla privada llamada `yc-nice-lady-data` con estas columnas:

| Columna | Tipo | Requerida | Uso |
| --- | --- | --- | --- |
| `record_type` | Texto | Sí | `finance`, `analytics`, `whatsapp-resolution`, `admin-credentials` o `admin-reset` |
| `record_id` | Texto | Sí | Identificador estable dentro del tipo |
| `payload` | Texto largo | Sí | Registro serializado como JSON por las funciones de Netlify |
| `created_at` | Fecha y hora | Sí | Fecha de creación en formato ISO |

Añade un índice único compuesto por `record_type` y `record_id`. No habilites lectura pública para esta tabla: contiene información administrativa y financiera.

Después agrega `APPWRITE_DATA_TABLE_ID` como variable privada de Netlify y como variable local en `.env`. La API Key del servidor requiere `rows.read`, `rows.write`, `files.read` y `files.write`.

La migración de información financiera, actividad, credenciales y resoluciones debe terminarse y revisarse antes de retirar los archivos SQL antiguos o borrar Supabase.
