# Spanish Listing Copy (Español)

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts were measured on 2026-10-12, the two full descriptions on 2026-10-14, and count Unicode characters.

| Block | Characters |
| --- | --- |
| Manifest description | 131 |
| Firefox Add-ons summary | 246 |
| Full description, Chrome and Edge | 10,124 |
| Full description, Firefox | 5,903 |
| What's new in 0.3.3 | 1,198 |

## Name

```text
Bookmark Scout
```

Read from `extName` in `apps/extension/public/_locales/es/messages.json`.

## Short summary

### Chrome Web Store and Edge Add-ons (manifest description, 132 characters maximum)

Packaged as `extDescription`; changing it needs a new version. Ships with 0.3.3 (131 characters):

```text
Guarda páginas rápido en la carpeta correcta: escribe parte de su nombre o deja que la IA sugiera una. Y busca y limpia marcadores.
```

### Firefox Add-ons summary (250 characters maximum)

```text
Guarda páginas rápido en la carpeta de marcadores correcta: escribe parte de su nombre, pulsa Alt+Shift+S para guardar en la más adecuada o deja que la IA opcional sugiera una. Con búsqueda instantánea, árbol de carpetas y administrador completo.
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
Bookmark Scout guarda cada página en la carpeta correcta en segundos, desde la barra de herramientas o con una sola combinación de teclas, y luego te ayuda a encontrar y ordenar tus marcadores sin salir del navegador.

GUARDA EN LA CARPETA CORRECTA EN SEGUNDOS
• Escribe parte del nombre de cualquier carpeta, aunque esté muy dentro del árbol, y guarda ahí la página actual sin soltar el teclado
• Escribe una ruta como work/react; un pequeño error de escritura no impide encontrar la carpeta, y las carpetas que usaste hace poco aparecen primero
• Una página que ya está en esa carpeta no se guarda dos veces
• La IA opcional sugiere la mejor carpeta para la página, o una nueva ruta de carpetas que revisas antes de que se cree
• Menú contextual opcional (activa Menú contextual en Configuración) para guardar enlaces en carpetas recientes

ATAJOS DE GUARDADO RÁPIDO
• Pulsa Alt+Shift+S en cualquier página para guardarla sin abrir Bookmark Scout: de forma predeterminada, en la carpeta que mejor coincide con la página (calculada en tu dispositivo), o en la última carpeta que usaste o en una que elijas
• Una pequeña notificación en la página indica dónde se guardó, con Deshacer y otras carpetas a las que moverla
• Con la IA activada, Alt+Shift+D guarda la página en la primera carpeta que sugiere la IA
• Cambia las teclas en la página de combinaciones de teclas del navegador. Ahí también puedes asignar Ctrl+D (⌘D en Mac) al guardado rápido para que sustituya al cuadro de diálogo de marcadores del navegador; Configuración explica cómo

BUSCA DESDE LA BARRA DE HERRAMIENTAS
• Búsqueda instantánea en todos los marcadores, con opciones para distinguir mayúsculas y minúsculas, buscar palabras completas y usar expresiones regulares
• Árbol de carpetas con arrastrar y soltar, desplegar y contraer todo, y creación de carpetas
• Panel lateral con el mismo árbol, la misma búsqueda y las carpetas coincidentes
• Eliminación con cuadro de diálogo de confirmación (activado de forma predeterminada) y opción de deshacer durante 10 segundos

ADMINISTRADOR DE MARCADORES
Bookmark Scout sustituye la página Marcadores del navegador por un administrador que funciona como el del propio navegador y añade ruta de navegación, una tabla que se puede ordenar y filtrar, columnas de ancho ajustable y búsquedas guardadas (vistas inteligentes que solo guardan tus filtros y siempre muestran resultados actualizados).
• Menús contextuales en marcadores, carpetas y espacios vacíos: editar, cambiar nombre, cortar, copiar, pegar, abrir en pestañas o ventanas nuevas, mostrar en la carpeta y eliminar
• Arrastra y suelta para mover marcadores a carpetas o cambiar su orden; los enlaces que sueltas desde otras páginas se convierten en marcadores
• Selecciona varias filas con Ctrl+clic y Mayús+clic, y usa las combinaciones de teclas del propio administrador del navegador (Cmd en Mac): Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V, Delete, Ctrl+Z para deshacer y Ctrl+Shift+Z para rehacer
• Deshacer y rehacer abarcan ediciones, movimientos, ordenaciones y eliminaciones, incluidos los cambios que hace Preguntar a la IA
• La dirección conserva la búsqueda y la carpeta, así que un enlace puede abrir el administrador ya buscando (?q=react) o en una carpeta, y Atrás y Adelante restauran ambas
• Elige qué comandos muestran los menús contextuales y ⋯, y en qué orden (Configuración > Comportamiento)

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

QUÉ TE PEDIRÁ EL NAVEGADOR Y POR QUÉ
Al instalarla, el navegador pide una sola cosa: «Leer y modificar tus marcadores», para que Bookmark Scout pueda guardarlos, buscarlos y ordenarlos. Todo lo demás se pide solo cuando usas la función que lo necesita, después de una breve explicación. Si dices que no, solo esa función queda desactivada.
• «Leer los iconos de los sitios web que visites»: cuando haces clic en Mostrar iconos del navegador en Actualizar iconos de sitios, o activas Usar la caché de iconos del navegador, para mostrar junto a tus marcadores los iconos que tu navegador ya guardó
• «Leer y modificar tus datos en todos los sitios de example.com» (o «en una serie de sitios web»): cuando ejecutas el Comprobador de enlaces rotos, el Extractor de metadatos o Actualizar iconos de sitios, solo para los sitios de esa ejecución. Una ejecución de más de 20 sitios, y el ajuste de IA Leer el contenido de la página, piden «Leer y cambiar todos tus datos en todos los sitios web». Las solicitudes se envían sin cookies. Una vez permitidos todos los sitios web, Preguntar a la IA también puede comprobar si los enlaces de tus marcadores siguen funcionando
• «Leer tu historial de navegación»: solo para guardar la página actual u obtener sugerencias de carpeta desde el panel lateral. El botón de la barra de herramientas y el atajo de guardado rápido no necesitan ningún permiso, y Bookmark Scout solo lee el título y la dirección de la pestaña abierta
• «Comunicarse con aplicaciones nativas cooperativas»: solo cuando activas Agentes de IA locales
El menú contextual también es opcional, pero no tiene advertencia, así que el navegador lo añade sin preguntar.

CONFIGURACIÓN Y COPIA DE SEGURIDAD
• Exportar, al final de Configuración, guarda una copia de seguridad: la configuración que cambiaste, los prompts personalizados, los servicios de IA (nunca sus claves de API), las búsquedas guardadas y las columnas del administrador. Importar la restaura
• Solo se guarda la configuración que cambias, así que las mejoras de los valores predeterminados en versiones posteriores te siguen llegando

HERRAMIENTAS DE IA OPCIONALES (DESACTIVADAS DE FORMA PREDETERMINADA)
Activa la IA en Configuración y elige un proveedor de IA en la nube, cualquier punto de conexión compatible con OpenAI o un servidor de modelos en tu propio equipo, con tu propia clave de API si el proveedor la exige.
• Sugerencias de carpeta para la página actual, incluida la creación revisada de una nueva ruta de carpetas
• Sugerencias de etiquetas y resúmenes breves que revisas antes de guardar
• Planes de reorganización de carpetas, siempre con vista previa antes de cambiar nada
• Exporta los marcadores seleccionados como contexto en Markdown o XML para un chat de IA (funciona sin IA y no envía nada)
• Preguntar a la IA: chatea sobre tus marcadores. La IA puede buscarlos por palabras, carpeta, etiqueta, sitio o fecha en que se añadieron, encontrar duplicados, sugerir carpetas y consultar la página actual
• Preguntar a la IA solo hace cambios cuando se lo pides: guarda páginas y propone movimientos, cambios de nombre, eliminaciones y carpetas nuevas como un plan que no cambia nada hasta que lo apruebas. Todos los cambios se pueden deshacer
• Las respuestas pueden terminar con botones: una pregunta de seguimiento, opciones para elegir, guardar la página en una carpeta sugerida o abrir un marcador. No pasa nada hasta que haces clic
• Elige qué puede consultar o cambiar Preguntar a la IA (Configuración > IA)
• Leer el contenido de la página (desactivado de forma predeterminada): envía el texto legible de cada página, no solo su título y URL, para obtener mejores sugerencias
• Agentes de IA locales (desactivado de forma predeterminada): permite que los agentes de IA de tu equipo, como Claude Code, consulten tus marcadores a través del programa de código abierto bookmark-scout-mcp, que se instala aparte. Si además activas Permitir cambios, pueden guardar y reorganizar marcadores, y cada cambio espera tu aprobación en una ventana de Bookmark Scout

Cuando usas una función de IA, los datos que necesita se envían directamente desde tu navegador al proveedor que elegiste, según las condiciones de ese proveedor: títulos de marcadores, URLs, nombres de carpetas, las fechas en que se añadieron los marcadores, y etiquetas y resúmenes guardados; el título y la URL de la página actual; tus mensajes de Preguntar a la IA; si los enlaces que comprueba Preguntar a la IA siguen funcionando; y, solo con Leer el contenido de la página activado, el texto de las páginas implicadas. No se envía nada a Bookmark Scout. Tu clave de API se guarda en el almacenamiento local de extensiones de este navegador y no se sincroniza. El uso del proveedor puede ser de pago.

PRIVACIDAD
• Sin cuenta, sin analíticas, sin seguimiento y sin anuncios
• Los marcadores se quedan en tu navegador; las etiquetas, los resúmenes y las búsquedas guardadas se quedan en el almacenamiento local de la extensión
• La configuración que cambias y tus prompts personalizados se sincronizan a través de la cuenta del navegador cuando el navegador lo admite
• Código abierto con licencia AGPL-3.0: https://github.com/isandrel/bookmark-scout

ACTUALIZACIÓN DESDE UNA VERSIÓN ANTERIOR
La versión 0.3.3 guarda sus datos en un formato nuevo y no convierte los datos anteriores: la configuración vuelve a sus valores predeterminados, hay que volver a añadir los servicios de IA y las claves de API, y se borran los prompts personalizados, las búsquedas guardadas, las etiquetas, los resúmenes y los iconos de sitios guardados. Tus marcadores no se modifican.

Disponible en 9 idiomas. Temas claro, oscuro y del sistema.

Documentación: https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
Bookmark Scout guarda cada página en la carpeta correcta en segundos, desde la barra de herramientas o con una sola combinación de teclas, y luego te ayuda a encontrar y ordenar tus marcadores sin salir del navegador.

GUARDA EN LA CARPETA CORRECTA EN SEGUNDOS
• Escribe parte del nombre de cualquier carpeta, aunque esté muy dentro del árbol, y guarda ahí la página actual sin soltar el teclado
• Escribe una ruta como work/react; un pequeño error de escritura no impide encontrar la carpeta, y las carpetas que usaste hace poco aparecen primero
• Una página que ya está en esa carpeta no se guarda dos veces
• La IA opcional sugiere la mejor carpeta para la página, o una nueva ruta de carpetas que revisas antes de que se cree
• Guarda enlaces en carpetas recientes desde el menú contextual

ATAJOS DE GUARDADO RÁPIDO
• Pulsa Alt+Shift+S en cualquier página para guardarla sin abrir Bookmark Scout: de forma predeterminada, en la carpeta que mejor coincide con la página (calculada en tu dispositivo), o en la última carpeta que usaste o en una que elijas
• Una pequeña notificación en la página indica dónde se guardó, con Deshacer y otras carpetas a las que moverla
• Con la IA activada, Alt+Shift+D guarda la página en la primera carpeta que sugiere la IA
• Cambia las teclas en Configuración > Guardar y buscar > Atajos de teclado

BUSCA DESDE LA BARRA DE HERRAMIENTAS
• Búsqueda instantánea en todos los marcadores, con opciones para distinguir mayúsculas y minúsculas, buscar palabras completas y usar expresiones regulares
• Árbol de carpetas con arrastrar y soltar, desplegar y contraer todo, y creación de carpetas
• El mismo árbol, la misma búsqueda y las carpetas coincidentes en la barra lateral de Firefox, que sigue abierta mientras navegas
• Eliminación con cuadro de diálogo de confirmación (activado de forma predeterminada) y opción de deshacer durante 10 segundos

ADMINISTRADOR DE MARCADORES
Abrir el administrador de marcadores, en la ventana emergente de la barra de herramientas o en la barra lateral, abre un administrador completo en una pestaña nueva, con árbol de carpetas y una tabla que se puede ordenar y filtrar.
• Menús contextuales en marcadores, carpetas y espacios vacíos: editar, cambiar nombre, cortar, copiar, pegar, abrir, mostrar en la carpeta y eliminar
• Arrastra y suelta para mover marcadores a carpetas o cambiar su orden; los enlaces que sueltas desde otras páginas se convierten en marcadores
• Selecciona varias filas con Ctrl+clic y Mayús+clic (Cmd en Mac), copia, corta y pega con las teclas habituales, y deshaz y rehaz tus cambios con Ctrl+Z y Ctrl+Shift+Z

CONFIGURACIÓN Y COPIA DE SEGURIDAD
• Exportar, al final de Configuración, guarda una copia de seguridad: la configuración que cambiaste, los prompts personalizados, los servicios de IA (nunca sus claves de API) y las búsquedas guardadas. Importar la restaura
• Solo se guarda la configuración que cambias, así que las mejoras de los valores predeterminados en versiones posteriores te siguen llegando

SUGERENCIAS DE CARPETA CON IA OPCIONALES (DESACTIVADAS DE FORMA PREDETERMINADA)
Activa la IA en Configuración y elige un proveedor de IA en la nube, cualquier punto de conexión compatible con OpenAI o un servidor de modelos en tu propio equipo, con tu propia clave de API si el proveedor la exige. Después, Bookmark Scout sugiere carpetas para la página actual, en la ventana emergente o con el atajo de guardado rápido con IA, y puede crear una nueva ruta de carpetas cuando la hayas revisado.

Cuando pides sugerencias, el título y la URL de la página actual y los nombres de tus carpetas se envían directamente desde tu navegador al proveedor que elegiste, según las condiciones de ese proveedor, y, solo si activas Leer el contenido de la página, el texto de la página. No se envía nada a Bookmark Scout. Tu clave de API se guarda en el almacenamiento local de extensiones de este navegador y no se sincroniza. El uso del proveedor puede ser de pago.

QUÉ TE PEDIRÁ FIREFOX Y POR QUÉ
Al instalarla, Firefox pide una sola cosa: permiso para leer y modificar los marcadores. Todo lo demás se pide solo cuando usas la función que lo necesita, después de una breve explicación. Si dices que no, solo esa función queda desactivada.
• Acceso a las pestañas del navegador: solo para guardar la página actual u obtener sugerencias de carpeta desde la barra lateral. El botón de la barra de herramientas y el atajo de guardado rápido no necesitan ningún permiso
• Activar la IA: Firefox pide compartir información de autenticación, marcadores y actividad de navegación (tu clave de API, tus marcadores y carpetas, y el título y la URL de la página actual). Su aviso dice que el desarrollador quiere recopilarlos; aquí eso significa el proveedor de IA que elegiste, que los recibe directamente desde tu navegador. Nada llega a Bookmark Scout
• Leer el contenido de la página: acceso a tus datos en todos los sitios web, y compartir el contenido de los sitios web con tu proveedor de IA
• Verificar servicio: acceso a la dirección de tu proveedor de IA, y compartir con él información de autenticación (tu clave de API)

PRIVACIDAD
• Sin cuenta, sin analíticas, sin seguimiento y sin anuncios
• Los marcadores se quedan en tu navegador
• La configuración que cambias y tus prompts personalizados se sincronizan con Firefox Sync si está activado
• Código abierto con licencia AGPL-3.0: https://github.com/isandrel/bookmark-scout

ACTUALIZACIÓN DESDE UNA VERSIÓN ANTERIOR
La versión 0.3.3 guarda sus datos en un formato nuevo y no convierte los datos anteriores: la configuración vuelve a sus valores predeterminados, hay que volver a añadir los servicios de IA y las claves de API, y se borran los prompts personalizados, las búsquedas guardadas, las etiquetas, los resúmenes y los iconos de sitios guardados. Tus marcadores no se modifican.

Disponible en 9 idiomas. Temas claro, oscuro y del sistema.
```

## What's new in 0.3.3

Translation of the English release notes; paste into AMO's release notes for 0.3.3.

```text
• Guardado rápido: pulsa Alt+Shift+S en cualquier página para guardarla en la carpeta que mejor coincide con ella. Una notificación en la página indica dónde se guardó, con Deshacer y otras carpetas a las que moverla. Con la IA activada, Alt+Shift+D guarda en la primera sugerencia de la IA
• Administrador de marcadores: menús contextuales, arrastrar y soltar, cortar, copiar y pegar, selección de varias filas, y deshacer y rehacer
• Preguntar a la IA puede guardar páginas y proponer movimientos, cambios de nombre, eliminaciones y carpetas nuevas que no cambian nada hasta que los apruebas, y todos los cambios se pueden deshacer. Las respuestas pueden terminar con botones en los que puedes hacer clic
• Elige qué comandos muestran los menús del administrador y qué puede hacer Preguntar a la IA
• Exportar, en Configuración, ahora guarda una copia de seguridad que puedes importar
• Esta actualización restablece los datos guardados de Bookmark Scout: la configuración vuelve a sus valores predeterminados, y hay que volver a configurar los servicios de IA y las claves de API, los prompts personalizados, las búsquedas guardadas, las etiquetas y los resúmenes. Tus marcadores no se modifican
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
