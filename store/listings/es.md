# Spanish Listing Copy (Español)

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts count Unicode characters. The full descriptions and What's new were measured on 2026-10-23; the other blocks keep their earlier counts.

| Block | Characters |
| --- | --- |
| Manifest description | 131 |
| Firefox Add-ons summary | 243 |
| Full description, Chrome and Edge | 13,111 |
| Full description, Firefox | 7,138 |
| What's new in 0.3.5 | 1,461 |

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
Guarda páginas rápido en la carpeta correcta: escribe parte de su nombre, pulsa ⌥⇧S en Mac (Alt+Shift+S en Windows y Linux) para guardar en la más adecuada o deja que la IA opcional sugiera una. Con búsqueda, árbol de carpetas y administrador.
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

Plain text, 13,111 characters (2026-10-23); the Chrome Web Store allows 16,000. The same Edge condition as in `en.md` applies.

```text
Bookmark Scout guarda cada página en la carpeta correcta en segundos, desde la barra de herramientas o con una sola combinación de teclas, y luego te ayuda a encontrar y ordenar tus marcadores sin salir del navegador. Gratis, sin cuenta y sin anuncios.

GUARDA EN LA CARPETA CORRECTA EN SEGUNDOS
• Haz clic en el botón de Bookmark Scout, escribe parte del nombre de cualquier carpeta, aunque esté muy dentro del árbol, y guarda ahí la página sin soltar el teclado
• Escribe una ruta como ai/llms; un pequeño error de escritura no impide encontrar la carpeta, y las carpetas que usaste hace poco aparecen primero
• Una página que ya está en esa carpeta no se guarda dos veces
• La IA opcional sugiere la mejor carpeta para la página, o una carpeta nueva que revisas antes de que se cree
• Menú del clic derecho opcional (desactivado al principio; activa Menú del clic derecho en Configuración) para guardar un enlace, o la página en la que estás, en una carpeta reciente

ATAJOS DE GUARDADO RÁPIDO
• Pulsa ⌥⇧S en Mac (Alt+Shift+S en Windows y Linux) en cualquier página para guardarla sin abrir Bookmark Scout: de forma predeterminada, en la carpeta que mejor coincide con la página (calculada en tu dispositivo), o en la última carpeta que usaste o en una que elijas
• Una pequeña notificación en la página indica dónde se guardó, con Deshacer y otras carpetas a las que moverla
• Con la IA activada, ⌥⇧D en Mac (Alt+Shift+D en Windows y Linux) guarda la página en la primera carpeta que sugiere la IA
• Cambia las teclas en la página de combinaciones de teclas del navegador. Ahí también puedes asignar ⌘D en Mac (Ctrl+D en Windows y Linux) al guardado rápido para que sustituya al cuadro de diálogo de marcadores del navegador; Configuración explica cómo

ENCUENTRA TUS MARCADORES
• Busca en todos tus marcadores mientras escribes, directamente desde la barra de herramientas: títulos, direcciones, carpetas, etiquetas y resúmenes, con operadores como tag:, domain: y folder:
• Árbol de carpetas con arrastrar y soltar, desplegar y contraer todo, y creación de carpetas
• Panel lateral con el mismo árbol, la misma búsqueda y las carpetas coincidentes
• Deja el puntero sobre un marcador para ver su dirección, carpeta, etiquetas y resumen
• Eliminación con confirmación (activada de forma predeterminada) y opción de deshacer durante 10 segundos

ADMINISTRADOR DE MARCADORES
Bookmark Scout sustituye la página Marcadores del navegador por un administrador que funciona como el del propio navegador y añade ruta de navegación, una tabla que se puede ordenar y búsquedas guardadas que siempre muestran los resultados actuales.
• Menús contextuales en marcadores, carpetas y espacios vacíos: editar, cambiar nombre, cortar, copiar, pegar, abrir en pestañas o ventanas nuevas, mostrar en la carpeta y eliminar
• Arrastra y suelta para mover marcadores a carpetas o cambiar su orden; los enlaces que sueltas desde otras páginas se convierten en marcadores
• Selecciona varias filas con Cmd+clic y Mayús+clic, y usa las combinaciones de teclas del propio administrador del navegador: ⌘A, ⌘C, ⌘X, ⌘V, ⌘⌫, ⌘Z para deshacer y ⇧⌘Z para rehacer en Mac (Ctrl+clic, Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V, Delete, Ctrl+Z y Ctrl+Shift+Z en Windows y Linux)
• Deshacer y rehacer abarcan ediciones, movimientos, ordenaciones y eliminaciones, incluidos los cambios que hace Preguntar a la IA
• Muestra una carpeta o una búsqueda como lista o como tarjetas con la imagen de portada, las etiquetas y el resumen de cada página, y obtén una vista previa de un marcador sin abrirlo
• Historial de marcadores: cada cambio en tus marcadores, con lo que era cada elemento antes, Deshacer y Restaurar para los elementos eliminados incluso cuando ya no se puede deshacer
• Ajusta en Configuración los menús, las columnas, las tarjetas, los paneles laterales y los atajos de teclado del administrador y de la ventana emergente

LIMPIA AÑOS DE MARCADORES
• Limpiador de duplicados: revisa los grupos de duplicados y elige qué copia conservar
• Limpiador de URLs: previsualiza y quita los códigos de seguimiento de las direcciones web
• Comprobador de enlaces rotos: encuentra enlaces que ya no funcionan y revisa las reparaciones (eliminar, usar la nueva dirección, apuntar a una copia archivada o editarla), con opción de deshacer
• Extractor de metadatos: sugiere títulos de página y aplica solo los que elijas
• Escáner de privacidad: encuentra datos privados en tus marcadores, como direcciones de correo electrónico y códigos de inicio de sesión en enlaces
• Estadísticas: sitios, carpetas, profundidad y duplicados
• Actualizar iconos de sitios: obtiene el icono propio de cada sitio, sin servicios de iconos de terceros
• Reglas inteligentes: etiqueta los marcadores que coinciden con una búsqueda y muévelos a una carpeta, tras revisarlo, o a medida que llegan marcadores nuevos si lo activas
• Indexar texto de páginas: guarda en este dispositivo el texto de las páginas que elijas, para que la búsqueda encuentre palabras dentro de ellas
• Obtener portadas: guarda en este dispositivo la imagen de vista previa de cada página para la vista de tarjetas. Capturar portadas al navegar (desactivado de forma predeterminada) toma la imagen al abrir una página marcada
• Las herramientas largas siguen en segundo plano cuando cierras el administrador, con Pausar y Reanudar, y cada revisión permite ajustar muchos elementos a la vez
• Importación de un archivo de marcadores con vista previa, gestión de duplicados y opción de deshacer
• Exportación a HTML, JSON, Markdown o CSV, con una revisión de privacidad opcional que puede ocultar datos privados

QUÉ TE PEDIRÁ EL NAVEGADOR Y POR QUÉ
Al instalarla, el navegador pide una sola cosa: «Leer y modificar tus marcadores», para que Bookmark Scout pueda guardarlos, buscarlos y ordenarlos. Todo lo demás se pide solo cuando usas la función que lo necesita, después de una breve explicación. Si dices que no, solo esa función queda desactivada.
• «Leer los iconos de los sitios web que visites»: cuando haces clic en Mostrar iconos del navegador en Actualizar iconos de sitios, o activas Usar la caché de iconos del navegador, para mostrar junto a tus marcadores los iconos que tu navegador ya guardó
• «Leer y modificar tus datos en todos los sitios de example.com» (o «en una serie de sitios web»): cuando ejecutas el Comprobador de enlaces rotos, el Extractor de metadatos, Actualizar iconos de sitios, Indexar texto de páginas u Obtener portadas, solo para los sitios de esa ejecución. Una ejecución de más de 20 sitios, el ajuste de IA Leer el contenido de la página y Capturar portadas al navegar piden «Leer y cambiar todos tus datos en todos los sitios web»; las imágenes que toma Capturar portadas al navegar se quedan en este dispositivo. Las solicitudes se envían sin cookies. Una vez permitidos todos los sitios web, Preguntar a la IA también puede comprobar si los enlaces de tus marcadores siguen funcionando
• «Leer tu historial de navegación»: solo para guardar la página actual u obtener sugerencias de carpeta desde el panel lateral. El botón de la barra de herramientas y el atajo de guardado rápido no necesitan ningún permiso, y Bookmark Scout solo lee el título y la dirección de la pestaña abierta
• «Comunicarse con aplicaciones nativas cooperativas»: solo cuando activas Agentes de IA locales (consulta Para desarrolladores, más abajo)
El menú del clic derecho también es opcional, pero no tiene advertencia, así que el navegador lo añade sin preguntar.

PRIVACIDAD
• Sin cuenta, sin analíticas, sin seguimiento y sin anuncios
• Tus marcadores se quedan en tu navegador; las etiquetas, los resúmenes, las búsquedas guardadas, las Reglas inteligentes, el texto de las páginas, las portadas y el Historial de marcadores se quedan en este dispositivo
• La configuración que cambias, tus prompts personalizados y Sobre mí se sincronizan a través de la cuenta del navegador cuando el navegador lo admite

IA OPCIONAL (DESACTIVADA DE FORMA PREDETERMINADA)
La IA es opcional, y todo lo anterior funciona sin ella. Para usarla, necesitas una cuenta con una empresa de IA, que puede cobrar un poco cada vez que la usas, o un programa de IA gratuito en tu propio equipo. Bookmark Scout no tiene un servicio de IA propio: activa la IA en Configuración y añade el servicio que elegiste.
• Sugerencias de carpeta para la página actual, incluida una carpeta nueva que revisas primero
• En Chrome, sugerencias de carpeta gratuitas de la IA integrada de Chrome, que funciona en tu equipo sin cuenta ni clave, si el equipo puede ejecutarla
• Sugerencias de etiquetas y resúmenes breves que revisas antes de guardar
• Planes de reorganización de carpetas, siempre con vista previa antes de cambiar nada
• Preguntar a la IA: chatea sobre tus marcadores. Puede buscarlos por palabras, carpeta, etiqueta, sitio o fecha en que se añadieron, encontrar duplicados, sugerir carpetas y consultar la página actual
• Preguntar a la IA solo hace cambios cuando se lo pides: guarda páginas y propone movimientos, cambios de nombre, eliminaciones y carpetas nuevas como un plan que no cambia nada hasta que lo apruebas. Todos los cambios se pueden deshacer
• Las respuestas pueden terminar con botones: una pregunta de seguimiento, opciones para elegir, guardar la página en una carpeta sugerida o abrir un marcador. No pasa nada hasta que haces clic
• Elige qué puede consultar o cambiar Preguntar a la IA (Configuración > IA)
• Leer el contenido de la página (desactivado de forma predeterminada): envía el texto legible de cada página, no solo su título y su dirección, para obtener mejores sugerencias
• Las etiquetas, los resúmenes y los nombres de carpetas nuevas llegan en tu idioma, en el que elijas o en el idioma de cada página (Configuración > IA)

Cuando usas una función de IA, los datos que necesita se envían directamente desde tu navegador al servicio de IA que elegiste, según las condiciones de ese servicio: títulos de marcadores, direcciones, nombres de carpetas, las fechas en que se añadieron los marcadores, y etiquetas y resúmenes guardados; el título y la dirección de la página actual; tus mensajes de Preguntar a la IA; el texto de Sobre mí que escribas, si lo hay; si los enlaces que comprueba Preguntar a la IA siguen funcionando; y, solo con Leer el contenido de la página activado, el texto de las páginas implicadas. No se envía nada a Bookmark Scout. Tu clave de API se guarda en el almacenamiento local de extensiones de este navegador y no se sincroniza. Usar un servicio de IA puede costar dinero.

CONFIGURACIÓN Y COPIA DE SEGURIDAD
• Hacer copia de los ajustes, al final de Configuración, guarda las partes que elijas: tus ajustes, los ajustes de este equipo, las búsquedas guardadas y la vista de tabla, los prompts y Sobre mí, las Reglas inteligentes, los servicios de IA y las portadas. Las claves de API solo se incluyen si las seleccionas, y entonces quedan protegidas con una contraseña
• Restaurar ajustes muestra primero qué cambiaría cada parte, luego combina o reemplaza, y Deshacer importación lo revierte
• Solo se guarda la configuración que cambias, así que las mejoras de los valores predeterminados en versiones posteriores te siguen llegando

PARA DESARROLLADORES
• Operadores de búsqueda: title:, url:, domain:, folder:, tag:, summary:, content: (texto de la página), is:, has:, after:, before:, -palabra, OR y paréntesis; además, distinguir mayúsculas y minúsculas, palabras completas y expresiones regulares. La dirección del administrador conserva la búsqueda y la carpeta, así que un enlace puede abrirlo ya buscando (?q=react), y Atrás y Adelante restauran ambas
• Los servicios de IA pueden ser proveedores de IA en la nube, cualquier punto de conexión compatible con OpenAI o un servidor de modelos en tu propio equipo, con o sin clave de API
• Exporta los marcadores seleccionados como contexto en Markdown o XML para un chat de IA (funciona sin IA y no envía nada)
• El Escáner de privacidad también señala parámetros de consulta sensibles, fragmentos de URL y UUIDs
• Agentes de IA locales (desactivado de forma predeterminada): permite que los agentes de IA de tu equipo, como Claude Code, consulten tus marcadores a través del programa de código abierto bookmark-scout-mcp, que se instala aparte. Si además activas Permitir cambios, pueden guardar y reorganizar marcadores, y cada cambio espera tu aprobación en una ventana de Bookmark Scout
• Código abierto con licencia AGPL-3.0: https://github.com/isandrel/bookmark-scout

ACTUALIZACIÓN DESDE UNA VERSIÓN ANTERIOR
La versión 0.3.3 guarda sus datos en un formato nuevo y no convierte los datos anteriores: la configuración vuelve a sus valores predeterminados, hay que volver a añadir los servicios de IA y las claves de API, y se borran los prompts personalizados, las búsquedas guardadas, las etiquetas, los resúmenes y los iconos de sitios guardados. Tus marcadores no se modifican.

Creado por un desarrollador independiente: sin empresa, sin anuncios y sin cuenta. Disponible en 12 idiomas. Temas claro, oscuro y del sistema.

Documentación: https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
Bookmark Scout guarda cada página en la carpeta correcta en segundos, desde la barra de herramientas o con una sola combinación de teclas, y luego te ayuda a encontrar y ordenar tus marcadores sin salir del navegador. Gratis, sin cuenta y sin anuncios.

GUARDA EN LA CARPETA CORRECTA EN SEGUNDOS
• Haz clic en el botón de Bookmark Scout, escribe parte del nombre de cualquier carpeta, aunque esté muy dentro del árbol, y guarda ahí la página sin soltar el teclado
• Escribe una ruta como ai/llms; un pequeño error de escritura no impide encontrar la carpeta, y las carpetas que usaste hace poco aparecen primero
• Una página que ya está en esa carpeta no se guarda dos veces
• La IA opcional sugiere la mejor carpeta para la página, o una carpeta nueva que revisas antes de que se cree
• Guarda enlaces en carpetas recientes desde el menú del clic derecho, una vez que actives Menú del clic derecho en Configuración

ATAJOS DE GUARDADO RÁPIDO
• Pulsa ⌥⇧S en Mac (Alt+Shift+S en Windows y Linux) en cualquier página para guardarla sin abrir Bookmark Scout: de forma predeterminada, en la carpeta que mejor coincide con la página (calculada en tu dispositivo), o en la última carpeta que usaste o en una que elijas
• Una pequeña notificación en la página indica dónde se guardó, con Deshacer y otras carpetas a las que moverla
• Con la IA activada, ⌥⇧D en Mac (Alt+Shift+D en Windows y Linux) guarda la página en la primera carpeta que sugiere la IA
• Cambia las teclas en Configuración > Guardar y buscar > Atajos de teclado

ENCUENTRA TUS MARCADORES
• Busca en todos tus marcadores mientras escribes, directamente desde la barra de herramientas: títulos, direcciones, carpetas, etiquetas y resúmenes, con operadores como tag:, domain: y folder:
• Árbol de carpetas con arrastrar y soltar, desplegar y contraer todo, y creación de carpetas
• El mismo árbol, la misma búsqueda y las carpetas coincidentes en la barra lateral de Firefox, que sigue abierta mientras navegas
• Eliminación con confirmación (activada de forma predeterminada) y opción de deshacer durante 10 segundos

ADMINISTRADOR DE MARCADORES
Abrir el administrador de marcadores, en la ventana emergente de la barra de herramientas o en la barra lateral, abre un administrador completo en una pestaña nueva, con árbol de carpetas y una tabla que se puede ordenar.
• Menús contextuales en marcadores, carpetas y espacios vacíos: editar, cambiar nombre, cortar, copiar, pegar, abrir, mostrar en la carpeta y eliminar
• Arrastra y suelta para mover marcadores a carpetas o cambiar su orden; los enlaces que sueltas desde otras páginas se convierten en marcadores
• Selecciona varias filas con Cmd+clic y Mayús+clic, copia, corta y pega con las teclas habituales, y deshaz y rehaz tus cambios con ⌘Z y ⇧⌘Z en Mac (Ctrl+clic, Ctrl+Z y Ctrl+Shift+Z en Windows y Linux)

QUÉ TE PEDIRÁ FIREFOX Y POR QUÉ
Al instalarla, Firefox pide una sola cosa: permiso para leer y modificar los marcadores. Todo lo demás se pide solo cuando usas la función que lo necesita, después de una breve explicación. Si dices que no, solo esa función queda desactivada.
• Acceso a las pestañas del navegador: solo para guardar la página actual u obtener sugerencias de carpeta desde la barra lateral. El botón de la barra de herramientas y el atajo de guardado rápido no necesitan ningún permiso
• Activar la IA: Firefox pide compartir información de autenticación, marcadores y actividad de navegación (tu clave de API, tus marcadores y carpetas, y el título y la dirección de la página actual). Su aviso dice que el desarrollador quiere recopilarlos; aquí eso significa el servicio de IA que elegiste, que los recibe directamente desde tu navegador. Nada llega a Bookmark Scout
• Leer el contenido de la página: acceso a tus datos en todos los sitios web, y compartir el contenido de los sitios web con tu servicio de IA
• Capturar portadas al navegar (desactivado de forma predeterminada), que guarda en este dispositivo imágenes de las páginas marcadas que abres: acceso a tus datos en todos los sitios web, sin compartir nada
• Verificar servicio: acceso a la dirección de tu servicio de IA, y compartir con él información de autenticación (tu clave de API)

PRIVACIDAD
• Sin cuenta, sin analíticas, sin seguimiento y sin anuncios
• Tus marcadores se quedan en tu navegador
• La configuración que cambias, tus prompts personalizados y Sobre mí se sincronizan con Firefox Sync si está activado

SUGERENCIAS DE CARPETA CON IA OPCIONALES (DESACTIVADAS DE FORMA PREDETERMINADA)
La IA es opcional, y todo lo anterior funciona sin ella. Para usarla, necesitas una cuenta con una empresa de IA, que puede cobrar un poco cada vez que la usas, o un programa de IA gratuito en tu propio equipo. Activa la IA en Configuración y añade el servicio que elegiste. Después, Bookmark Scout sugiere carpetas para la página actual, en la ventana emergente o con el atajo de guardado rápido con IA, y puede crear una carpeta nueva cuando la hayas revisado.

Cuando pides sugerencias, el título y la dirección de la página actual y los nombres de tus carpetas se envían directamente desde tu navegador al servicio de IA que elegiste, según las condiciones de ese servicio, y, solo si activas Leer el contenido de la página, el texto de la página. No se envía nada a Bookmark Scout. Tu clave de API se guarda en el almacenamiento local de extensiones de este navegador y no se sincroniza. Usar un servicio de IA puede costar dinero.

CONFIGURACIÓN Y COPIA DE SEGURIDAD
• Hacer copia de los ajustes, al final de Configuración, guarda las partes que elijas: tus ajustes, los ajustes de este equipo, las búsquedas guardadas y la vista de tabla, los prompts y Sobre mí, los servicios de IA y más. Las claves de API solo se incluyen si las seleccionas, y entonces quedan protegidas con una contraseña
• Restaurar ajustes muestra primero qué cambiaría cada parte, luego combina o reemplaza, y Deshacer importación lo revierte
• Solo se guarda la configuración que cambias, así que las mejoras de los valores predeterminados en versiones posteriores te siguen llegando

PARA DESARROLLADORES
• Operadores de búsqueda: title:, url:, domain:, folder:, tag:, summary:, is:, has:, after:, before:, -palabra, OR y paréntesis; además, distinguir mayúsculas y minúsculas, palabras completas y expresiones regulares
• Los servicios de IA pueden ser proveedores de IA en la nube, cualquier punto de conexión compatible con OpenAI o un servidor de modelos en tu propio equipo, con o sin clave de API
• Código abierto con licencia AGPL-3.0: https://github.com/isandrel/bookmark-scout

ACTUALIZACIÓN DESDE UNA VERSIÓN ANTERIOR
La versión 0.3.3 guarda sus datos en un formato nuevo y no convierte los datos anteriores: la configuración vuelve a sus valores predeterminados, hay que volver a añadir los servicios de IA y las claves de API, y se borran los prompts personalizados, las búsquedas guardadas, las etiquetas, los resúmenes y los iconos de sitios guardados. Tus marcadores no se modifican.

Creado por un desarrollador independiente: sin empresa, sin anuncios y sin cuenta. Disponible en 12 idiomas. Temas claro, oscuro y del sistema.
```

## What's new in 0.3.5

Translation of the English release notes; paste into AMO's release notes for 0.3.5.

```text
• Portadas y tarjetas: muestra una carpeta del administrador de marcadores como tarjetas con la imagen de portada, las etiquetas y el resumen de cada página. Las portadas salen de la imagen de vista previa de la propia página, de una imagen de la pestaña que elijas o, si lo activas, de imágenes tomadas mientras navegas, y se quedan en este dispositivo
• Buscar dentro de las páginas: Indexar texto de páginas guarda en este dispositivo el texto de las páginas que elijas, para que la búsqueda encuentre palabras dentro de ellas
• La misma búsqueda en todas partes: títulos, direcciones, carpetas, etiquetas y resúmenes, con operadores como tag:, domain:, folder: y OR
• Las Reglas inteligentes etiquetan los marcadores que coinciden con una búsqueda y los mueven a una carpeta, tras revisarlo
• El Historial de marcadores muestra cada cambio en tus marcadores, con Deshacer, y puede recuperar elementos eliminados
• Las herramientas largas siguen en segundo plano cuando cierras el administrador
• Ajusta en Configuración los menús, las columnas, los atajos de teclado, el menú del clic derecho y más
• Haz copia de las partes de tus ajustes que elijas y mira qué cambiaría una restauración antes de Combinar o Reemplazar, con Deshacer importación. Las claves de API solo se incluyen si las seleccionas, protegidas con una contraseña
• Los ajustes de Títulos e iconos de páginas ahora se llaman Detalles de páginas
• Idiomas nuevos: ruso, indonesio e italiano
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
