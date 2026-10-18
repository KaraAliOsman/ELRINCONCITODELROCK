# El Rinconcito del Rock — operación de la tienda

**Abrir tienda:** https://el-rinconcito-del-rock.aliosmankara111.workers.dev  
**Administración:** https://el-rinconcito-del-rock.aliosmankara111.workers.dev/admin  
**Código y despliegues:** https://github.com/KaraAliOsman/ELRINCONCITODELROCK

La contraseña está en **ACCESO-PRIVADO.txt**, entregado por separado. Ese archivo es privado; entregarlo únicamente al dueño o personal autorizado; no subirlo al repositorio.

## Trabajar cada día

1. Entrar al panel y revisar **Pedidos**. El resumen de nuevas reservas se actualiza cada 30 segundos. No se envían correos automáticos: los pedidos aparecen en el panel y el cliente conserva su enlace privado.
2. Contactar al comprador con los datos del pedido. Confirmar edición/condición, pago y entrega. Para despacho, acordar courier, costo y plazo antes del pago.
3. Marcar **Pago recibido y verificado** solo cuando se haya recibido. Cambiar a **Confirmado**. Para envío, ingresar también el costo de despacho acordado.
4. Marcar **Listo para retiro** o **Enviado** según corresponda; anotar courier y seguimiento. Al entregar, marcar **Entregado**.
5. Registrar cada venta del local en **Caja**. Así el inventario físico y la web usan las mismas cantidades.

La bolsa no aparta stock. Al enviar la reserva, el servidor comprueba stock/precio y descuenta unidades. Repetir un mismo intento no crea un pedido duplicado. La duración inicial es de 24 horas y se puede cambiar en **Configuración**. Las reservas no pagadas vencidas liberan unidades cada 15 minutos y también al consultar pedidos o gestionar nuevas reservas. Cancelar libera stock una sola vez; un pedido pagado exige registrar que se realizó el reembolso.

## Códigos de barras y caja

Todos los títulos tienen un código interno estable **Code 128**. Cada ejemplar del mismo producto usa el mismo código; ediciones diferentes conservan códigos diferentes. Los discos nuevos reciben uno automáticamente.

**Preparar etiquetas:**

1. En **Inventario**, buscar los discos por artista, álbum o código y marcarlos en las casillas. La selección se conserva al cambiar de página.
2. Abrir **Etiquetas** y elegir cuántas imprimir de cada título, o **Una por unidad disponible**. Máximo 300 etiquetas por lote. Se puede incluir o quitar el precio.
3. Elegir A4 para etiquetas de 64 × 38 mm (tres columnas), o rollo de 60 × 40 mm.
4. Imprimir al **100 %**, sin ajuste a página, encabezados ni pies del navegador. El A4 usa márgenes de 7 mm y separación horizontal de 2 mm; comprobar que coincidan con la hoja del local. En impresora térmica seleccionar también el tamaño de papel de 60 × 40 mm en su controlador.
5. Probar una etiqueta con el lector antes de imprimir todo el lote. Pegar la etiqueta en una funda protectora, sin cubrir información del disco.

Si el ejemplar ya tiene un **EAN o UPC de fábrica**, se puede escanear en **Editar disco → EAN / UPC de fábrica** y guardar. Se conserva como texto para respetar los ceros iniciales y se verifica su dígito de control. El sistema no identifica automáticamente códigos que aún no fueron vinculados. Si dos ediciones comparten EAN/UPC, usar las etiquetas internas de cada edición: el panel rechaza códigos duplicados.

**Vender con el lector:**

1. Conectar un lector USB o Bluetooth que reconozca Code 128, en **modo teclado / HID**, con sufijo **Enter**. No hace falta instalar un plugin en la web.
2. Abrir **Caja** y dejar el cursor en **Lector de códigos**. Escanear cada disco. Repetir el código suma otra unidad, hasta el stock disponible. También se puede escribir el código y pulsar Enter, o buscar el artista/álbum y añadirlo manualmente.
3. Revisar discos, cantidades y total. Los códigos desconocidos o agotados aparecen como error y deben revisarse con **Entendido** antes de continuar.
4. Elegir el medio de pago y marcar **Pago recibido y verificado** únicamente después de cobrar. Si cambia la selección, se pide verificar nuevamente el pago del total actualizado.
5. Pulsar **Registrar venta**. La venta queda pagada y entregada en **Pedidos**; las unidades se descuentan del inventario compartido con la web. **Escanear solo prepara la venta: no descuenta stock.**
6. Pulsar **Nueva venta** para atender a la siguiente persona. El lector vuelve a quedar listo.

El borrador se conserva al recargar la misma pestaña; no es un apartado de stock. Si se corta la conexión al registrar, pulsar **Comprobar y registrar venta**: se consulta o reintenta el mismo registro sin duplicar el descuento. Mantener la pestaña abierta hasta resolver ese intento y revisar **Pedidos** si se cerró por accidente. Las ventas requieren conexión a internet; no existe caja offline.

**Anular una venta presencial:** en **Pedidos**, abrirla, elegir **Anular venta y devolver stock**, confirmar **Reembolso realizado al cliente** y guardar. Hacerlo solo tras recibir de vuelta todos los discos y reembolsar al cliente. Es una anulación completa; las devoluciones parciales requieren gestión manual. Las unidades vuelven al inventario una sola vez. Se conserva el registro.

En **Editar disco → Movimientos de inventario** se consultan los últimos movimientos: ventas presenciales, reservas web, liberaciones y ajustes. El CSV exportado incluye el código interno y el de fábrica; para modificarlos se usa el editor del panel, no la importación de precios y stock.

El flujo de lector se verificó simulando sus teclas en el navegador. Los códigos se decodificaron digitalmente a tamaños equivalentes a impresión de 203 y 300 dpi. No se conectaron la impresora ni el lector físicos del negocio; la prueba de una etiqueta en el local sigue siendo necesaria para ajustar el papel y el sufijo del equipo.

## Productos y Excel

En **Inventario** se pueden crear o editar discos, precio, unidades, descripción, destacados, visibilidad e imagen. Un cambio concurrente de stock bloquea una edición antigua para impedir que sobrescriba una venta.

Para actualizar con Excel:

1. Exportar el inventario CSV desde el panel.
2. Abrirlo en Excel y modificar únicamente **price** y **stock**. Conservar **id** y **version**.
3. Guardar CSV, importarlo y revisar el resultado. Las filas que cambiaron durante la edición se omiten; exportar de nuevo para editarlas con el stock vigente.

El stock inicial proviene del Excel recibido: **3.378 productos**, **2.845 con stock**, **4.431 unidades**. La hoja privada de cuentas quedó excluida. No se corrigieron a mano nombres, precios ni cantidades del original.

Cinco productos no se publicaron porque el precio o cantidad no era válido: Celia Cruz / The Queen of Salsa, Nino Bravo / Mi Tierra, Billie Joe Armstrong / No Fun Mondays, Jhon Coltrane / Now Playing y LCD Soundsystem / New Body Rumba. Pueden agregarse desde el panel cuando el negocio confirme sus datos.

Las 467 carátulas son referencias del álbum. Los demás títulos muestran un marcador neutro sin foto del ejemplar. No se inventaron edición ni condición. Sustituirlas por fotos de los ejemplares cuando estén disponibles: el panel optimiza y guarda imágenes JPG, PNG o WebP.

## Contacto, horario y entregas

Se verificó **Freire 1119, Concepción**, en [Maps](https://maps.app.goo.gl/GPBfSjqsU2NeSdVV8). Horario: lunes a sábado **11:00–13:00 y 13:40–18:30**; domingo cerrado. La pausa figura en la [publicación oficial de Instagram](https://www.instagram.com/elrinconcitodelrock/p/DecBBdVkZd0/).

[Instagram oficial](https://www.instagram.com/elrinconcitodelrock/) anuncia entregas en Concepción/alrededores y envíos a todo Chile. No apareció un WhatsApp ni correo comercial vigente verificable; no se publicó un teléfono de terceros de 2020. Instagram está activo como contacto. Un WhatsApp o correo comercial se agrega en **Configuración**, sin tocar código. Courier, costo y plazo se coordinan antes del pago porque no se encontraron condiciones públicas confirmadas.

## Lo pendiente: dominio y cobro online

**Dominio:** en Cloudflare, abrir el Worker `el-rinconcito-del-rock` → dominios/rutas → agregar Custom Domain del negocio. La URL actual ya funciona con HTTPS. Canonical y sitemap se construyen con el dominio usado.

**Cobro online:** conectar el proveedor y la cuenta comercial que el negocio elija. La integración debe crear pagos en el servidor, verificar monto/CLP y procesar webhook firmado antes de confirmar. La reserva no realiza un cobro ni pide tarjetas. Mientras se integra, el panel permite registrar pagos recibidos fuera del sitio.

## Respaldos y mantenimiento

El repositorio contiene código, catálogo inicial y migraciones. Su flujo de GitHub Actions verifica y publica cambios en `main`; no vuelve a reemplazar cantidades del inventario. Revisar la pestaña **Actions** después de un cambio.

Exportar productos y pedidos desde el panel de forma periódica. Para un respaldo completo de D1, el desarrollador puede ejecutar `wrangler d1 export rinconcito-db --remote --output respaldo.sql`. Guardar ese archivo en privado porque contiene datos de clientes y fotos. Cloudflare D1 también ofrece recuperación Time Travel. El ZIP entregado respalda el código; no se actualiza con futuras ventas.

Los secretos administrativos están guardados en Cloudflare, fuera del código público. Para cambiar la contraseña, usar `wrangler secret put ADMIN_PASSWORD`; para cerrar sesiones previas, renovar `SESSION_SECRET`. Las credenciales de despliegue se guardaron como secretos de GitHub Actions. Conviene rotar el token y las credenciales S3 que se compartieron en el chat y actualizar el secreto de GitHub con el nuevo token autorizado; no son necesarios para entrar al panel de la tienda.

Las skills de Cloudflare están instaladas y su MCP registrado. La autorización OAuth del MCP quedó pendiente; se completa con `codex mcp login cloudflare`. La tienda y su despliegue automático funcionan mediante el token API, sin depender de ese OAuth. R2 no estaba habilitado en la cuenta; las fotos se guardan en D1 y el sitio no requiere habilitarlo.

## Verificación realizada

33 pruebas de integración contra Worker y D1 locales: acceso privado, origen, precios manipulados, reservas duplicadas, compradores concurrentes de última unidad, rollback de `D1.batch`, cancelación, vencimiento, pago, despacho, CSV, imágenes, solicitudes y ventas presenciales, EAN/UPC, códigos duplicados y simultáneos, historial y anulación de caja. Además: compilación TypeScript/Vite, dry-run de Wrangler y revisión del rediseño con el logo real. Se recorrieron catálogo, filtros, favoritos, ficha, bolsa, validación del formulario, reserva y cancelación locales, teclado y panel de administración. Se revisaron anchos de 320, 390, 768 y 1265 px. Las pruebas móviles fueron emuladas; no se dispuso de un teléfono físico conectado. Se verificaron rutas, SEO, inventario y acceso administrativo en producción.

No se importaron pedidos ficticios a producción.
