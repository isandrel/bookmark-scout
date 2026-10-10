# Spanish Listing Copy (Español)

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts were measured on 2026-10-10 and count Unicode characters.

| Block | Characters |
| --- | --- |
| Optional manifest description | 131 |
| Firefox Add-ons summary | 247 |
| Full description, Chrome and Edge | 5,166 |
| Full description, Firefox | 2,603 |

## Name

```text
Bookmark Scout
```

Read from `extName` in `apps/extension/public/_locales/es/messages.json`.

## Short summary

### Chrome Web Store and Edge Add-ons (manifest description, 132 characters maximum)

Packaged as `extDescription`; changing it needs a new version. Ships with the next version after 0.3.2 (131 characters):

```text
Guarda páginas rápido en la carpeta correcta: escribe parte de su nombre o deja que la IA sugiera una. Y busca y limpia marcadores.
```

### Firefox Add-ons summary (250 characters maximum)

```text
Guarda páginas rápido en la carpeta de marcadores correcta: escribe parte de su nombre, aunque esté anidada, y guarda con el teclado, o deja que la IA opcional sugiera una. Con búsqueda instantánea y árbol de carpetas, también en el panel lateral.
```

## Search terms (Edge Add-ons)

```text
guardar en carpeta
administrador de marcadores
buscar marcadores
marcadores duplicados
enlaces rotos
carpetas de marcadores
marcadores con IA
```

## Full description: Chrome Web Store and Edge Add-ons

The same Edge condition as in `en.md` applies.

```text
Bookmark Scout guarda cada página en la carpeta correcta en segundos y luego te ayuda a encontrar y ordenar tus marcadores sin salir del navegador.

GUARDA EN LA CARPETA CORRECTA EN SEGUNDOS
• Escribe parte del nombre de cualquier carpeta, aunque esté muy dentro del árbol, y guarda ahí la página actual sin soltar el teclado
• Escribe una ruta como work/react; un pequeño error de escritura no impide encontrar la carpeta, y las carpetas que usaste hace poco aparecen primero
• Una página que ya está en esa carpeta no se guarda dos veces
• La IA opcional sugiere la mejor carpeta para la página, o una nueva ruta de carpetas que revisas antes de que se cree
• Menú contextual opcional (activa Menú contextual en Configuración) para guardar enlaces en carpetas recientes

BUSCA DESDE LA BARRA DE HERRAMIENTAS
• Búsqueda instantánea en todos los marcadores, con opciones para distinguir mayúsculas y minúsculas, buscar palabras completas y usar expresiones regulares
• Árbol de carpetas con arrastrar y soltar, desplegar y contraer todo, y creación de carpetas
• Panel lateral con el mismo árbol, la misma búsqueda y las carpetas coincidentes
• Combinaciones de teclas que nunca sustituyen a los atajos Ctrl/Cmd del navegador
• Eliminación con cuadro de diálogo de confirmación (activado de forma predeterminada) y opción de deshacer durante 10 segundos

ADMINISTRADOR DE MARCADORES
Bookmark Scout sustituye la página Marcadores del navegador por un administrador con árbol de carpetas, ruta de navegación, una tabla que se puede ordenar y filtrar, columnas de ancho ajustable y búsquedas guardadas (vistas inteligentes que solo guardan tus filtros y siempre muestran resultados actualizados).

HERRAMIENTAS DE MANTENIMIENTO
• Limpiador de duplicados: revisa los grupos de duplicados antes de quitar las copias sobrantes
• Limpiador de URLs: previsualiza y quita los parámetros de seguimiento
• Comprobador de enlaces rotos: encuentra enlaces inaccesibles y revisa las reparaciones (eliminar, usar el destino de la redirección, apuntar a una copia archivada o editar la URL), con opción de deshacer
• Extractor de metadatos: sugiere títulos de página y aplica solo los que selecciones
• Escáner de privacidad: encuentra parámetros de consulta sensibles, fragmentos de URL, direcciones de correo electrónico y UUIDs en los marcadores
• Estadísticas: dominios, carpetas, profundidad y duplicados
• Actualizar iconos de sitios: obtiene el icono propio de cada sitio, sin servicios de iconos de terceros
• Importación desde HTML o JSON con vista previa, gestión de duplicados y opción de deshacer
• Exportación a HTML, JSON, Markdown o CSV, con una revisión de privacidad opcional que puede censurar valores sensibles

El Comprobador de enlaces rotos, el Extractor de metadatos, Actualizar iconos de sitios y el ajuste de IA Leer el contenido de la página piden acceso opcional a los sitios web la primera vez que los usas. Ese acceso nunca se concede al instalar, las solicitudes se envían sin cookies y, si lo rechazas, simplemente se desactiva esa función.

HERRAMIENTAS DE IA OPCIONALES (DESACTIVADAS DE FORMA PREDETERMINADA)
Activa la IA en Configuración y elige un proveedor de IA en la nube, cualquier punto de conexión compatible con OpenAI o un servidor de modelos en tu propio equipo, con tu propia clave de API si el proveedor la exige.
• Sugerencias de carpeta para la página actual, incluida la creación revisada de una nueva ruta de carpetas
• Sugerencias de etiquetas y resúmenes breves que revisas antes de guardar
• Planes de reorganización de carpetas, con vista previa antes de cambiar nada (predeterminado)
• Exporta los marcadores seleccionados como contexto en Markdown o XML para un chat de IA (funciona sin IA y no envía nada)
• Preguntar a la IA: chatea sobre tus marcadores; la IA puede buscar marcadores coincidentes, los nombres de tus carpetas y la página actual
• Leer el contenido de la página (desactivado de forma predeterminada): envía el texto legible de cada página, no solo su título y URL, para obtener mejores sugerencias

Cuando usas una función de IA, los datos que necesita se envían directamente desde tu navegador al proveedor que elegiste, según las condiciones de ese proveedor: títulos de marcadores, URLs, nombres de carpetas, y etiquetas y resúmenes guardados; el título y la URL de la página actual; tus mensajes de Preguntar a la IA; y, solo con Leer el contenido de la página activado, el texto de las páginas implicadas. No se envía nada a Bookmark Scout. Tu clave de API se guarda en el almacenamiento local de extensiones de este navegador y no se sincroniza. El uso del proveedor puede ser de pago.

PRIVACIDAD
• Sin cuenta, sin analíticas, sin seguimiento y sin anuncios
• Los marcadores se quedan en tu navegador; las etiquetas, los resúmenes y las búsquedas guardadas se quedan en el almacenamiento local de la extensión
• La configuración se sincroniza a través de la cuenta del navegador cuando el navegador lo admite
• Código abierto con licencia AGPL-3.0: https://github.com/isandrel/bookmark-scout

Disponible en 9 idiomas. Temas claro, oscuro y del sistema.

Documentación: https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
Bookmark Scout guarda cada página en la carpeta correcta en segundos y luego te ayuda a encontrar tus marcadores sin salir del navegador.

GUARDA EN LA CARPETA CORRECTA EN SEGUNDOS
• Escribe parte del nombre de cualquier carpeta, aunque esté muy dentro del árbol, y guarda ahí la página actual sin soltar el teclado
• Escribe una ruta como work/react; un pequeño error de escritura no impide encontrar la carpeta, y las carpetas que usaste hace poco aparecen primero
• Una página que ya está en esa carpeta no se guarda dos veces
• La IA opcional sugiere la mejor carpeta para la página, o una nueva ruta de carpetas que revisas antes de que se cree
• Guarda enlaces en carpetas recientes desde el menú contextual

BUSCA DESDE LA BARRA DE HERRAMIENTAS
• Búsqueda instantánea en todos los marcadores, con opciones para distinguir mayúsculas y minúsculas, buscar palabras completas y usar expresiones regulares
• Árbol de carpetas con arrastrar y soltar, desplegar y contraer todo, y creación de carpetas
• El mismo árbol, la misma búsqueda y las carpetas coincidentes en el panel lateral de Firefox, que sigue abierto mientras navegas
• Combinaciones de teclas que nunca sustituyen a los atajos Ctrl/Cmd del navegador
• Eliminación con cuadro de diálogo de confirmación (activado de forma predeterminada) y opción de deshacer durante 10 segundos

SUGERENCIAS DE CARPETA CON IA OPCIONALES (DESACTIVADAS DE FORMA PREDETERMINADA)
Activa la IA en Configuración y elige un proveedor de IA en la nube, cualquier punto de conexión compatible con OpenAI o un servidor de modelos en tu propio equipo, con tu propia clave de API si el proveedor la exige. Después, Bookmark Scout sugiere carpetas para la página actual y puede crear una nueva ruta de carpetas cuando la hayas revisado.

Cuando pides sugerencias, el título y la URL de la página actual y los nombres de tus carpetas se envían directamente desde tu navegador al proveedor que elegiste, según las condiciones de ese proveedor. No se envía nada a Bookmark Scout. Tu clave de API se guarda en el almacenamiento local de extensiones de este navegador y no se sincroniza. El uso del proveedor puede ser de pago.

PRIVACIDAD
• Sin cuenta, sin analíticas, sin seguimiento y sin anuncios
• Los marcadores se quedan en tu navegador
• La configuración se sincroniza con Firefox Sync si está activado
• Código abierto con licencia AGPL-3.0: https://github.com/isandrel/bookmark-scout

Disponible en 9 idiomas. Temas claro, oscuro y del sistema.

El administrador de marcadores se abre en una pestaña nueva desde la ventana emergente de la barra de herramientas.
```

## Category

Same as `en.md`. Stores set the category once for all locales.

## Support and links

Same as [`en.md`](en.md#support-and-links). Where a store accepts a value per locale, use the Spanish pages:

| Field | Value |
| --- | --- |
| Support URL | https://bookmark-scout.com/es/support/ |
| Privacy policy URL | https://bookmark-scout.com/es/privacy/ |
| Support email | support@bookmark-scout.com |
