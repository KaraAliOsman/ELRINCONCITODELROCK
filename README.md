# El Rinconcito del Rock

Tienda operativa de vinilos y CDs en Concepción. Diseño propio en blanco y negro, centrado en el logo oficial, las carátulas y la compra de discos. React + Vite, API en Cloudflare Workers e inventario en D1.

**Tienda:** https://el-rinconcito-del-rock.aliosmankara111.workers.dev
**Panel privado:** https://el-rinconcito-del-rock.aliosmankara111.workers.dev/admin

## Qué funciona

- Catálogo real, búsqueda sin tildes, filtros, orden y paginación.
- Favoritos y bolsa persistentes; fichas con stock y precio.
- Pedidos con retiro o despacho, reserva temporal de inventario y seguimiento privado.
- Precios calculados en el servidor, stock reservado en una transacción e idempotencia.
- Administración de productos, imágenes, pedidos, pagos recibidos, entregas y solicitudes de discos.
- Caja con lector USB/Bluetooth: escaneo de etiquetas Code 128, EAN/UPC vinculados, cantidades y pago verificado.
- Códigos internos estables para todos los discos, etiquetas A4 o rollo de 60 × 40 mm y exportación de códigos.
- Inventario compartido entre web y local, historial por disco y anulación de ventas con reembolso y devolución de stock.
- Importación y exportación CSV con protección ante cambios concurrentes.
- SEO por producto, sitemap, vistas móvil y escritorio, navegación por teclado y movimiento reducido.
- Despliegue automático desde `main`, después de compilación y pruebas contra Worker + D1 locales.

El sitio **no cobra online** todavía. Registra reservas y permite confirmar pagos recibidos fuera del sitio. Dominio y proveedor de cobro online quedan por conectar.

## Inventario inicial y datos comerciales

3.378 productos, 2.845 disponibles y 4.431 unidades importados de `STOCK TIENDA 1.xlsx`. Se excluyó la hoja privada de cuentas y cinco filas inválidas. No se cambió el archivo original. Ver [informe de importación](data/import-report.json).

Datos verificados en [Instagram oficial](https://www.instagram.com/elrinconcitodelrock/) y [Maps](https://maps.app.goo.gl/GPBfSjqsU2NeSdVV8): Freire 1119, Concepción; lunes a sábado 11:00–13:00 y 13:40–18:30; domingo cerrado. El horario con pausa figura en [esta publicación oficial](https://www.instagram.com/elrinconcitodelrock/p/DecBBdVkZd0/).

Instagram es el contacto vigente verificado. El negocio anuncia entregas locales y envíos a Chile. No se publicaron teléfonos antiguos, courier, plazos ni tarifas sin verificar. El despacho se cotiza antes del pago. La duración inicial de reserva de 24 horas es configurable desde administración.

Las 467 imágenes de productos son carátulas **de referencia**, nunca una afirmación sobre la edición o condición del ejemplar. Los otros títulos muestran un marcador sin foto. Ver [créditos](public/assets/CREDITS.md) y [fuentes de carátulas](data/artwork-credits.json). La tienda puede sustituirlas por fotos de sus ejemplares desde el panel.

## Desarrollo

Node 22 o posterior.

```sh
npm ci
cp .dev.vars.example .dev.vars
# Completar ADMIN_PASSWORD y SESSION_SECRET localmente.
npm run build
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

En otra terminal, `npm test` prueba el Worker de `http://127.0.0.1:8787`. Las pruebas crean datos ficticios solamente en la D1 local y ocultan sus productos al terminar. Se niegan a ejecutarse contra un dominio público. `npm run test:ci` está pensado para un checkout limpio de CI; genera credenciales locales temporales.

## Cloudflare y publicación

Worker: `el-rinconcito-del-rock`. D1: `rinconcito-db`. Recursos y enlaces configurados en `wrangler.jsonc`.

Secretos del Worker: `ADMIN_PASSWORD` y `SESSION_SECRET`, gestionados con `wrangler secret put`. Nunca son variables públicas de Vite. Rotar `SESSION_SECRET` cierra las sesiones existentes.

Secretos de GitHub Actions: `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`. El token requiere editar Workers y D1 de esta cuenta. El flujo usa estos secretos únicamente en el job de despliegue, después de validar.

```sh
npm run build
npx wrangler deploy --dry-run
npm run db:migrate
npx wrangler deploy
```

**No ejecutar la carga inicial para reemplazar stock vigente.** `data/seed.sql` usa `INSERT OR IGNORE` para conservar registros existentes. El flujo automático aplica migraciones y publica código; no vuelve a importar cantidades.

Las imágenes subidas se optimizan en el navegador y se almacenan en D1, hasta 512 KB cada una. R2 no estaba habilitado en esta cuenta y no es una dependencia del sitio.

## Operación

Mantener abierto el panel para revisar pedidos; el resumen se actualiza cada 30 segundos. Confirmar pago solo tras verificarlo. Para despacho, registrar el costo acordado antes de confirmar, y luego courier/seguimiento. Las reservas vencidas se liberan cada 15 minutos y también al consultar pedidos o gestionar nuevas reservas.

Registrar las ventas presenciales en el panel para que se descuente su stock. Para editar en Excel, exportar el CSV del panel, modificar únicamente `price` y `stock` y conservar `id` y `version`. Una fila que cambió durante la edición se rechaza sin sobrescribir esa venta.

### Lector y etiquetas

En **Inventario**, seleccionar discos y abrir **Etiquetas**. Cada título tiene un código interno estable, compartido por sus ejemplares. Se pueden imprimir hasta 300 etiquetas por lote en A4 (64 × 38 mm, 3 columnas) o rollo de 60 × 40 mm. Usar escala 100 %, sin encabezados ni ajuste a página. El panel también permite vincular el EAN/UPC real desde **Editar**; se valida su dígito de control y se impide asignarlo a dos ediciones, incluso si el lector entrega su equivalente con ceros al inicio. El CSV incluye ambos códigos; se editan desde el panel, no mediante la importación de precios/stock.

Abrir **Caja**, conectar un lector que reconozca Code 128 en modo teclado con sufijo Enter y enfocar **Lector de códigos**. Cada lectura añade una unidad. Revisar el total, el medio de pago y marcar **Pago recibido y verificado**; **Registrar venta** descuenta las unidades y guarda el pedido pagado. Escanear por sí solo no modifica el inventario. Los códigos desconocidos o sin stock se señalan y deben revisarse antes de continuar. El borrador se conserva al recargar la misma pestaña. Un intento con respuesta incierta se reenvía con el mismo identificador para evitar duplicados.

En **Pedidos**, una venta presencial entregada se puede anular tras confirmar el reembolso y la devolución de todos sus discos; el stock se restaura una sola vez. Es una anulación completa, no una devolución parcial. **Editar disco → Movimientos de inventario** muestra ventas, reservas y ajustes.

Exportar regularmente productos y pedidos desde el panel. Para un respaldo técnico completo, usar `wrangler d1 export rinconcito-db --remote --output respaldo.sql`; conservarlo en un lugar privado porque contiene datos de clientes. D1 dispone de Time Travel para recuperación. El respaldo de código no contiene pedidos posteriores al despliegue.

## Conectar lo pendiente

**Dominio:** añadir un Custom Domain al Worker en Cloudflare, usando el dominio que el negocio controle. El SEO construye URLs con el dominio de la solicitud; no requiere recompilar para actualizar canonical y sitemap.

**Cobro online:** elegir proveedor y cuenta comercial, implementar inicio de pago en el Worker y webhook firmado, validar monto y CLP, y confirmar solo el pago acreditado. No marcar un pedido como pagado basándose en un retorno del navegador. Hay que coordinar la expiración de reservas y validar cancelaciones/reembolsos con ese proveedor antes de activar el cobro.

El setup oficial de Cloudflare instaló sus skills y registró el servidor MCP. Su OAuth no se completó en esta sesión; `codex mcp login cloudflare` permite autorizarlo cuando se necesite. La tienda y GitHub Actions ya operan con el token API y no dependen del MCP.

## Validación

34 comprobaciones de integración cubren autorización, origen, precios manipulados, idempotencia, última unidad concurrente entre web y caja, rollback real de `D1.batch`, cancelación, expiración, pagos, despacho, importación CSV, imágenes, códigos duplicados y simultáneos, EAN/UPC, precio desactualizado en caja y anulación de venta. Compilación TypeScript/Vite, dry-run de Wrangler y verificación pública de rutas, stock, SEO y panel privado. La base de producción se publica sin fixtures de pruebas. Lector e impresora físicos requieren una prueba de etiqueta en el local; el flujo de teclado se verificó en navegador y los códigos mediante decodificación digital independiente.
