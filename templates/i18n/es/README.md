{# source: 755c10623769 #}
{% import "../../_partials/markdown.md.j2" as md %}
{{ md.language_switcher() }}
<p align="center">
  <img src="https://raw.githubusercontent.com/{{ site.repo.slug }}/{{ site.repo.branch }}/apps/extension/public/icon-128.png" alt="Logotipo de {{ site.name }}" width="96" height="96">
</p>

<h1 align="center">{{ site.name }}</h1>

<h3 align="center">Guarda cada página en la carpeta de marcadores correcta, en segundos.</h3>

<p align="center">
  Escribe unas letras del nombre de una carpeta, o pulsa un atajo, y la página va a la carpeta que le corresponde.<br>
  Gratis, sin cuenta y sin anuncios. No se envía nada al desarrollador.
</p>

<p align="center">
{{ md.store_badges("Añadir a {browser}") }}
</p>

<p align="center">
  <a href="{{ site.url }}"><img src="https://img.shields.io/badge/sitio%20web-visitar-{{ site.brand_color }}?style=flat-square" alt="Sitio web"></a>
  <a href="{{ docs_url }}"><img src="https://img.shields.io/badge/guías-leer-{{ site.brand_color }}?style=flat-square" alt="Guías"></a>
  <a href="{{ site.license.file_url }}"><img src="https://img.shields.io/badge/código%20abierto-{{ md.badge_text(site.license.spdx) }}-blue?style=flat-square" alt="Licencia de código abierto"></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="{{ screenshots.popup.dark }}">
    <img src="{{ screenshots.popup.light }}" alt="La ventana emergente de {{ site.name }}: al escribir &quot;fin&quot; aparece la carpeta Fine-tuning dentro de AI / LLMs, lista para guardar ahí la página con Enter. Al lado, sugerencias opcionales de IA para un artículo sobre la caché de prompts, entre ellas una carpeta nueva." width="800">
  </picture>
</p>

## ✨ Qué hace

- 📁 **Guarda en la carpeta correcta escribiendo su nombre.** Escribe unas letras, incluso de una carpeta escondida dentro de otras, y pulsa Enter. Aunque cometas un pequeño error de escritura, la carpeta aparece igual.
- ⚡ **Guarda con un solo atajo.** Pulsa {{ shortcuts["commands.quick-save"].both }} en cualquier página. Un pequeño mensaje indica dónde se guardó la página, con **Deshacer** y otras carpetas a las que moverla.
- 🔎 **Encuentra todo lo que guardaste.** Busca en todos tus marcadores mientras escribes, desde la barra de herramientas, el panel lateral o un administrador de marcadores a página completa.
- 🧹 **Ordena años de marcadores.** Quita los duplicados, encuentra los enlaces que ya no funcionan y elimina los códigos de seguimiento de las direcciones web. Ves cada cambio antes de que se haga y puedes deshacerlo.
- 🕘 **Ve cada cambio y recupera lo que borraste.** El historial muestra cada cambio en tus marcadores, también los hechos fuera de Bookmark Scout, y recupera lo eliminado, incluso después de reiniciar el navegador. Se queda en tu ordenador.
- ✨ **Sugerencias de IA opcionales.** Deja que la IA elija la carpeta por ti, con tu propia cuenta de IA o con un modelo de IA gratuito en tu propio equipo, como el que viene integrado en Chrome. La IA está desactivada hasta que la activas.
- 🔒 **Privacidad desde el diseño.** Sin cuenta, sin anuncios, sin seguimiento, y no se envía nada al desarrollador. Guardar y buscar funcionan incluso sin conexión.

🌍 Disponible en {{ locales|map(attribute="name")|join(" · ") }}.

## 📦 Instalación

{{ md.store_links("muy pronto en {store}. Mientras tanto, puedes [instalarla a mano]({docs}/installation#{id}) (avanzado).") }}

Después, guarda tu primera página:

1. **Fíjala.** Haz clic en el icono de la pieza de rompecabezas de la barra de herramientas del navegador y luego en la chincheta junto a {{ site.name }}.
2. **Abre una página que quieras conservar** y haz clic en el icono de {{ site.name }}.
3. **Escribe unas letras del nombre de una carpeta** y pulsa Enter: la página se guarda en la primera carpeta de la lista. Para elegir otra, pulsa ↓ antes. Eso es todo.

La próxima vez, basta con pulsar {{ shortcuts["commands.quick-save"].both }} en la página. La [guía para guardar y organizar]({{ docs_url }}/guides/save-and-organize) explica más.

## 🔒 Tu privacidad

{{ site.name }} no tiene cuenta ni servidor, así que el desarrollador nunca recibe tus marcadores, tu configuración ni nada más. Tus marcadores se leen y se modifican dentro de tu navegador. Los datos solo salen de él cuando usas una función que lo necesita, por ejemplo la IA (van a la empresa de IA que elegiste) o la comprobación de enlaces rotos (visita los sitios web guardados en tus marcadores). Lee la [política de privacidad]({{ pages.privacy }}) para conocer los detalles.

## 🔐 Permisos

Lo que te pedirá el navegador:

- **Al instalarla:** *«Leer y modificar tus marcadores».* Es lo único que {{ site.name }} necesita para empezar.
- **Solo cuando usas una función que necesita más**, después de una breve explicación de {{ site.name }}. Por ejemplo, comprobar los enlaces rotos pide permiso para visitar esos sitios web, y guardar desde el panel lateral pide ver qué pestaña está abierta. Si dices que no, solo esa función queda desactivada.

Consulta [cada permiso y para qué se necesita]({{ docs_url }}/permissions).

## ❓ Preguntas

**¿De verdad es gratis?**<br>
Sí. Sin anuncios ni planes de pago, y cualquiera puede leer el código. Si activas la IA con la cuenta de una empresa de IA, esa empresa puede cobrarte por usarla.

**¿Necesito la IA?**<br>
No. Guardar, buscar y limpiar funcionan sin ella.

**¿Funciona en Firefox, Edge o Safari?**<br>
Firefox y Edge: sí (consulta [Instalación](#-instalación)). Safari: no, porque Safari no permite que las extensiones trabajen con los marcadores.

Encontrarás más respuestas en las [preguntas frecuentes]({{ docs_url }}/faq).

## 💬 Ayuda y enlaces

- 🌐 Sitio web: [{{ site.url }}]({{ site.url }})
- 📖 Guías: [{{ docs_url }}]({{ docs_url }})
- ✉️ Correo electrónico: [{{ contact.support }}](mailto:{{ contact.support }})
- 🐞 ¿Has encontrado un problema o tienes una idea? [Cuéntanoslo en GitHub]({{ site.repo.new_issue }})

{{ site.name }} lo crea un desarrollador independiente, [@{{ site.author.name }}]({{ site.author.url }}), no una empresa: sin anuncios, sin cuenta y de código abierto.

## 🛠️ Para desarrolladores y agentes de IA

Cómo compilarla desde el código fuente, las tecnologías que usa, el estado del proyecto y las pruebas están en [DEVELOPMENT.md]({{ links.DEVELOPMENT }}) (en inglés). Si quieres colaborar, lee [CONTRIBUTING.md]({{ links.CONTRIBUTING }}). Los agentes de programación con IA de tu equipo, como Claude Code, pueden buscar y organizar tus marcadores con tu aprobación: consulta [Usar con agentes de IA locales]({{ docs_url }}/guides/local-agents).

---

<p align="center">
  Gratis y de código abierto con la <a href="{{ root }}LICENSE">licencia {{ site.license.spdx }}</a>.
</p>
