# Score Grabber

Extensión de navegador para descargar partituras, archivos de audio y MIDI de MuseScore.

## Características

- **Descargar MIDI** - Archivos de audio MIDI para software de notación musical
- **Descargar MP3** - Archivos de audio de alta calidad
- **Descargar PDF** - Partituras completas con todas las páginas
- **Ver partitura** - Visualizar imágenes de la partitura directamente
- **Panel de depuración** - Logs detallados para diagnóstico
- **Actualizaciones automáticas** - Verificación de nuevas versiones

## Instalación

### Chrome/Edge (Modo Desarrollador)

1. Abrir `chrome://extensions/`
2. Habilitar "Modo desarrollador"
3. Hacer clic en "Cargar extensión descomprimida"
4. Seleccionar la carpeta `src` de este proyecto

### Firefox

1. Abrir `about:debugging#/runtime/this-firefox`
2. Hacer clic en "Cargar complemento temporal"
3. Seleccionar `src/manifest.json`

## Cómo Funciona

La extensión intercepta tokens de las llamadas API internas de MuseScore y los usa para descargar archivos directamente. Esto evita la necesidad de pagos adicionales por contenido premium.

### Flujo de descarga

1. **Detección automática** - La extensión detecta cuando estás en una página de partitura de MuseScore
2. **Extracción de tokens** - Extrae tokens de autenticación de la página
3. **Generación de tokens** - Usa el algoritmo interno de MuseScore para generar tokens válidos
4. **Descarga directa** - Descarga archivos directamente desde los servidores de MuseScore

## Estructura del Proyecto

```
src/
├── manifest.json          # Configuración de la extensión (Manifest V3)
├── background/
│   └── background.js      # Service worker para interceptar tokens
├── content/
│   ├── content.js         # Lógica principal de la extensión
│   └── content.css        # Estilos para elementos inyectados
├── popup/
│   ├── popup.html         # Interfaz del popup
│   ├── popup.js           # Lógica del popup
│   └── popup.css          # Estilos del popup
├── sandbox/
│   ├── sandbox.html       # Página aislada para ejecución segura
│   └── sandbox.js         # Generación de tokens en sandbox
├── modules/
│   └── updater.js         # Sistema de actualizaciones automáticas
├── pdfmake.min.js         # Librería para generación de PDF
└── vfs_fonts.js           # Fuentes para PDF
```

## Desarrollo

### Requisitos

- Navegador Chrome, Edge o Firefox
- Modo desarrollador habilitado
- Acceso a internet para MuseScore

### Pasos para desarrollar

1. Realizar cambios en los archivos de `src/`
2. Recargar la extensión en el navegador (`chrome://extensions/` → botón recargar)
3. Actualizar cualquier página de MuseScore
4. Abrir panel de depuración desde el popup

### Build (opcional)

El script `build.ps1` empaqueta pdfmake y fuentes en content.js:

```powershell
.\build.ps1
```

## Solución de Problemas

### La extensión no detecta la partitura

1. Asegúrate de estar en una página de MuseScore (`musescore.com`)
2. Recarga la página
3. Haz clic en el ícono de la extensión
4. Si aparece "Script de contenido no listo", recarga la página

### Los botones no funcionan

1. Abre el panel de depuración (ícono 🔧)
2. Revisa los logs para errores
3. Si ves "Token algorithm FALLÓ", puede ser que MuseScore haya cambiado su sistema

### CAPTCHA de Cloudflare

Si aparece un CAPTCHA de Cloudflare:
1. Resuelve el CAPTCHA manualmente en la página
2. Espera unos segundos
3. Intenta descargar de nuevo

### PDF no se genera

1. Verifica que pdfmake esté cargado (revisa logs)
2. Si dice "pdfmake aún no cargado", espera unos segundos
3. Recarga la página y vuelve a intentar

## Compatibilidad

- ✅ Chrome (recomendado)
- ✅ Edge
- ✅ Brave
- ✅ Firefox (v109 o superior)
- ❌ Safari (no soportado)

### Notas para Firefox

Firefox requiere Manifest V3 con algunas diferencias:
- La extensión incluye `browser_specific_settings` para gecko
- El service worker se ejecuta como script de fondo
- Algunas APIs pueden tener comportamiento ligeramente diferente
- Para desarrollo, usa `about:debugging#/runtime/this-firefox`

## Notas Importantes

- **Uso educativo** - Esta extensión es para fines educativos
- **Actualizaciones** - El algoritmo de tokens puede necesitar actualizaciones si MuseScore cambia su sistema
- **Privacidad** - La extensión no recopila ni envía datos personales

## Licencia

MIT

## Créditos

Basado en investigaciones de:
- `dl-librescore` - Repositorio original (MIT)
- `musescore-downloader` - Extensión similar