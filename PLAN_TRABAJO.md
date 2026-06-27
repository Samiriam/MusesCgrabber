# Plan de Trabajo - Score Grabber

## Estado del Proyecto
- **Fecha inicio:** 2026-06-26
- **Estado:** En desarrollo activo
- **Versión actual:** 1.0.0 (v6 con logs detallados del sandbox)
- **Licencia:** MIT

---

## Cambios Realizados

### Fase 1: Investigación (26-06-2026)
- [x] Analizar repositorio `dl-librescore` (MIT, 2.9k estrellas, userscript)
- [x] Analizar repositorio `musescore-downloader` (sin licencia, 395 estrellas, extensión)
- [x] Identificar arquitectura y flujo de tokens
- [x] Documentar diferencias entre ambos proyectos

**Conclusiones:**
- El original tiene 2 métodos para tokens: Algorithm y Scrape
- Algorithm es el más confiable pero complejo
- Scrape simula interacciones del usuario

---

### Fase 2: Creación del proyecto (26-06-2026)
- [x] Crear estructura básica en `musescore-downloader-ext/`
- [x] Implementar `manifest.json` (Manifest V3)
- [x] Implementar `background.js` (interceptor de tokens)
- [x] Implementar `content.js` (lógica principal)
- [x] Implementar `popup/` (UI básica)
- [x] Implementar `sandbox/` (ejecución aislada)
- [x] Renombrar proyecto a `score-grabber`
- [x] Mover de `TVAnimeApp/` a `AndroidStudioProjects/`

---

### Fase 3: Sistema de actualizaciones (26-06-2026)
- [x] Crear `modules/updater.js`
- [x] Verificar actualizaciones cada 6 horas desde GitHub
- [x] Notificación cuando hay update disponible
- [x] Banner de update en popup

---

### Fase 4: Debugging y correcciones (26-06-2026)

#### Problema 1: Error "Manifiesto no válido"
- **Causa:** El manifest referenciaba PNG icons que no existían
- **Solución:** Eliminar referencias a iconos
- **Aprendizaje:** No referenciar archivos que no existen en el manifest

#### Problema 2: Error "No se pudo cargar JavaScript (content.js)"
- **Causa:** Chrome no acepta JavaScript moderno (async/await, arrow functions) en contextos de service worker
- **Solución:** Reescribir todo en ES5 compatible
- **Archivos modificados:** background.js, content.js, popup.js
- **Aprendizaje:** Los service workers de Chrome tienen restricciones de ES5

#### Problema 3: Error "No se ha podido cargar la secuencia de comandos"
- **Causa:** El ZIP tenía los archivos dentro de subcarpetas
- **Solución:** Aplanar estructura - todos los archivos en la raíz del ZIP
- **Aprendizaje:** Chrome requiere manifest.json en la raíz del ZIP, no dentro de subcarpetas

#### Problema 4: Popup no detectaba página de MuseScore
- **Causa:** Faltaba el permiso `activeTab` en el manifest
- **Solución:** Agregar `activeTab` a permissions
- **Aprendizaje:** Para acceder a la URL de la pestaña activa, se necesita el permiso `activeTab`

#### Problema 5: Descargas fallaban con "Failed"
- **Causa 1:** Solo teníamos interceptor básico de tokens (esperaba que el usuario hiciera requests)
- **Causa 2:** El método scrape no funcionaba bien con MIDI/MP3
- **Causa 3:** PDF abría verificación de Cloudflare (nos detectaban como bot)
- **Solución parcial:** Implementar algoritmo completo de tokens del original
- **Estado:** Mejorado pero aún con problemas

#### Problema 6: "Processing..." se queda colgado
- **Causa:** El método scrape crea iframes que nunca resuelven
- **Solución:** Agregar timeouts (3s para algoritmo, 30s para operación total)
- **Archivos modificados:** content.js
- **Aprendizaje:** Siempre poner timeouts en operaciones que dependen de elementos externos

---

### Fase 5: Panel de Debug (26-06-2026)
- [x] Agregar botón 🔧 en popup
- [x] Crear panel de logs visible
- [x] Diferentes colores por tipo de log (info, success, warn, error, send, recv)
- [x] Timestamp en cada log
- [x] Botón para limpiar logs
- [x] Mensajes enviados y recibidos visibles

**Archivos modificados:**
- `popup.html` - Agregar panel de debug
- `popup.js` - Sistema de logging
- `popup.css` - Estilos del panel

---

### Fase 6: Algoritmo de Tokens Integrado (26-06-2026)
- [x] Integrar algoritmo completo de tokens en `content.js`
- [x] Extracción de randomToken del script de MuseScore
- [x] Búsqueda de función MD5 (_digestsize/_blocksize)
- [x] Modificación del script para exponer `window.generateToken`
- [x] Ejecución en sandbox aislado
- [x] Timeout de 15 segundos para inicialización del sandbox
- [x] Timeout de 3 segundos para generación de tokens
- [x] Timeout de 30 segundos para operación completa
- [x] Fallback automático a método scrape si algoritmo falla

**Resultado:**
- Algoritmo se ejecuta pero sandbox tiene timeout
- Necesita más tiempo para scripts grandes

---

### Fase 7: Mejoras al Scrape y Logs Detallados (26-06-2026)
- [x] Aumentado timeout del sandbox de 5s a 15s
- [x] Mejorado método scrape para MP3:
  - Agregado selector para botón móvil `#scorePlayButton`
  - Mejor manejo de clicks en botón play
- [x] Mejorado método scrape para MIDI:
  - Agregado selector SVG path para botón MIDI
  - Mejor manejo de clicks
- [x] Mejorado método scrape para imágenes:
  - Aumentado tamaño del contenedor a 500000px
  - Agregado log de cantidad de tokens capturados
- [x] Agregados logs detallados en `sandbox.js`:
  - Tamaño del script recibido
  - Tiempo de ejecución del script
  - Verificación de `window.generateToken` después de ejecutar
  - Test de generación de token de prueba
  - Logs de errores con stack trace
- [x] Agregados logs en `content.js`:
  - Tamaño del script antes de enviar
  - Confirmación de envío del mensaje
  - Captura de errores de postMessage
- [x] Agregado sistema de log history persistente en storage

**Resultado:**
- Sandbox timeout persiste (script es muy grande)
- Scrape aún no captura tokens (necesita más investigación)
- Logs detallados ahora disponibles para diagnóstico

---

### Fase 8: Diagnóstico Avanzado del Sandbox (26-06-2026)

#### Problema 7: Script end NOT replaced
- **Evidencia:** Logs mostraban "✗ Step 2: Script end NOT replaced"
- **Causa:** El script de MuseScore termina con sourceMappingURL en lugar de `}}])`
- **Solución:** 
  - Remover sourceMappingURL antes de buscar patrones de cierre
  - Buscar múltiples patrones: `}}])`, `})`, `]);`, `])`
- **Archivos modificados:** content.js
- **Resultado:** ✅ Script end ahora se reemplaza correctamente

#### Problema 8: Content Security Policy bloquea new Function()
- **Evidencia:** 
  ```
  EvalError: Evaluating a string as JavaScript violates the following 
  Content Security Policy directive because 'unsafe-eval' is not an 
  allowed source of script: script-src 'self'
  ```
- **Causa:** El sandbox no tiene permiso para ejecutar código dinámico
- **Investigación:** Revisado manifest del original (musescore-downloader)
- **Hallazgo:** El manifest original NO tiene `content_security_policy`
- **Solución:** Agregar solo la sección `sandbox` al manifest (sin CSP explícito)
- **Archivos modificados:** manifest.json
- **Estado:** ✅ Corregido

---

### Fase 9: Primera Descarga Exitosa (26-06-2026)

#### Hallazgo CRÍTICO: El algoritmo de tokens SÍ funciona
- **Evidencia:** Usuario descargó una partitura exitosamente
- **Formato descargado:** PNG (primera página), no PDF completo
- **Archivo:** Se guardó pero no abrió automáticamente

**Lo que funciona ahora:**
- ✅ Token algorithm genera tokens válidos
- ✅ Sandbox ejecuta el script correctamente (CSP corregido)
- ✅ API de MuseScore responde con URLs de imágenes
- ✅ Descarga de archivos funciona

**Lo que falta:**
- ❌ Generar PDF con TODAS las páginas (no solo la primera)
- ❌ Abrir automáticamente el archivo descargado
- ❌ Mostrar progreso de descarga

**Próximos pasos inmediatos:**
1. Implementar descarga de múltiples páginas
2. Generar PDF usando pdfmake
3. Mejorar UI con progreso de descarga

---

### Fase 10: Generación de PDF Completo (26-06-2026)

#### Problema 9: CSP bloquea carga de pdfmake desde CDN
- **Evidencia:**
  ```
  Loading the script 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js' 
  violates the following Content Security Policy directive
  ```
- **Causa:** Content scripts no pueden cargar scripts externos
- **Investigación:** Revisado cómo lo hace el original
- **Hallazgo:** El original usa webpack para empaquetar pdfmake en el bundle
- **Solución:** Crear script de build que concatene archivos
- **Archivos creados:** `build.ps1`
- **Archivos modificados:** `content.js`, `manifest.json`
- **Resultado:** ✅ Build funciona, pdfmake empaquetado

#### Script de build creado:
```powershell
# build.ps1 - Concatena pdfmake + vfs_fonts + content.js
$pdfmake = Get-Content "src\pdfmake.min.js" -Raw
$vfs = Get-Content "src\vfs_fonts.js" -Raw
$content = Get-Content "src\content\content.js" -Raw
Set-Content -Path "dist\content.js" -Value "$pdfmake`n$vfs`n$content"
```

#### Cambios en manifest.json:
```json
"web_accessible_resources": [{
  "resources": ["sandbox.html", "pdfmake.min.js", "vfs_fonts.js"],
  "matches": ["https://*.musescore.com/*"]
}]
```

---

### Fase 11: PDF Completo Implementado (26-06-2026)

**🎉 FUNCIONALIDAD COMPLETA: PDF con todas las páginas**

**Qué hace el código:**
1. Cuenta páginas de la partitura
2. Descarga TODAS las imágenes (no solo la primera)
3. Genera PDF usando pdfmake (empaquetado)
4. Descarga el PDF completo

**Flujo:**
```
Click "Download PDF"
  → Detecta: 5 páginas
  → Descarga página 1, 2, 3, 4, 5
  → Genera PDF con pdfmake
  → Descarga: "Composer - Song.pdf"
```

**Estado actual:**
- ✅ Token algorithm funciona
- ✅ Sandbox ejecuta script
- ✅ API responde con URLs
- ✅ pdfmake empaquetado en content.js
- ✅ Build script funciona
- ⏳ Pendiente de prueba final por usuario

---

### Fase 12: Conversión SVG a PNG (26-06-2026)

#### Problema 10: pdfmake no acepta imágenes SVG
- **Evidencia:**
  ```
  Invalid image: Error: Unknown image format.
  Images dictionary should contain dataURL entries
  ```
- **Causa:** MuseScore devuelve imágenes SVG, pdfmake solo acepta PNG/JPEG
- **Solución:** Convertir SVG a PNG usando Canvas antes de pasar a pdfmake
- **Archivos modificados:** content.js
- **Resultado:** ✅ PDF se genera correctamente

**Código de conversión:**
```javascript
function svgToPng(svgBlob) {
  return new Promise((resolve, reject) => {
    var reader = new FileReader();
    reader.onloadend = function() {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        var pngDataUrl = canvas.toDataURL('image/png');
        resolve(pngDataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(svgBlob);
  });
}
```

---

### Fase 14: CAPTCHA de Cloudflare (26-06-2026)

#### Problema 12: CAPTCHA_PASS_REQUIRED en API
- **Evidencia:** 
  ```
  {"error":{"name":"Unprocessable entity","message":"CAPTCHA_PASS_REQUIRED"}}
  ```
- **Causa:** Cloudflare detecta muchas requests y pide verificación "¿Eres humano?"
- **Afecta a:** TODOS los exploradores (Comet, Brave, Chrome, Edge)
- **NO es de MuseScore:** Es protección de Cloudflare
- **Solución:** La extensión debe DETENERSE cuando detecte CAPTCHA

**Cómo funciona el CAPTCHA:**
1. Cloudflare detecta requests automáticos
2. Muestra checkbox "¿Eres humano?" en la página
3. Usuario resuelve el CAPTCHA
4. Las requests funcionan normalmente
5. Si la extensión sigue chocando, empeora el problema

**Solución implementada:**
- Detectar errores de CAPTCHA en la API
- Detener la extensión después de 3 intentos
- Mostrar mensaje: "Solve CAPTCHA on page"
- Esperar a que el usuario resuelva
- Reintentar cuando el usuario haga clic en "Download PDF"

**Estado:** ✅ Solución implementada

**Nota importante:** El CAPTCHA aparece cuando la extensión hace demasiadas requests. La extensión original también lo activa, pero le da机会 al usuario de resolverlo.

---

## Decisiones Técnicas

| Decisión | Elegido | Razón |
|----------|---------|-------|
| Manifest version | V3 | Más moderno, recomendado |
| Estructura ZIP | Plana (sin subcarpetas) | Chrome requiere manifest.json en raíz |
| Lenguaje | ES5 compatible | Service workers tienen restricciones |
| PDF generation | pdfmake empaquetado | CSP bloquea scripts externos |
| Token method | Algoritmo + Scrape fallback | Más confiable |
| Debug panel | Popup visible | Más fácil que abrir DevTools |
| Build system | PowerShell script | Simple, sin dependencias |
| Image format | SVG → PNG conversion | pdfmake no acepta SVG |
| Page detection | 5 métodos diferentes | MuseScore cambia estructura HTML |
| Browser compat | Brave recomendado | Comet tiene restricciones |

---

## Patrones de dl-librescore a Replicar

| Patrón | Estado | Notas |
|--------|--------|-------|
| Token Algorithm | ✅ Implementado | Extrae script de MuseScore, genera tokens |
| Iframe Hook | ❌ Pendiente | Más complejo, mejor captura |
| Webpack Hook | ✅ Implementado | Build script concatena archivos |
| Anti-Detection | ❌ Pendiente | Evita que MuseScore detecte la extensión |
| PDF Generation | ✅ Implementado | pdfmake empaquetado en content.js |

---

## Errores NO Repetir

1. **No usar async/await** en service workers
2. **No usar arrow functions** en service workers  
3. **No usar template literals** en service workers
4. **No usar optional chaining** en service workers
5. **No usar Map()** - usar objetos {}
6. **No referenciar archivos inexistentes** en manifest
7. **No olvidar activeTab** para acceder a URL de pestaña
8. **No olvidar web_accessible_resources** para archivos accedidos via chrome.runtime.getURL
9. **No poner subcarpetas** en el ZIP - manifest debe estar en raíz
10. **No olvidar timeouts** en operaciones asíncronas
11. **No agregar content_security_policy** en manifest - Chrome lo bloquea
12. **No olvidar sección sandbox** en manifest para páginas de sandbox
13. **No cargar scripts externos** en content scripts - CSP lo bloquea
14. **Usar build script** para empaquetar dependencias en content.js
15. **Incluir pdfmake en bundle** - no cargar dinámicamente

---

## Próximos Pasos

### Estado: ✅ COMPLETADO

**La extensión está funcional en Brave.** No hay más pasos pendientes.

### Mejoras futuras (opcional)
1. Agregar soporte para más exploradores
2. Mejorar UI con progreso de descarga
3. Agregar conversión a otros formatos (MusicXML, MSCZ)

---

## Archivos del Proyecto

```
score-grabber/
├── PLAN_TRABAJO.md          # Este archivo
├── README.md                # Documentación básica
├── package.json             # NPM config
├── build.ps1                # Script de build
├── score-grabber-v1.0.0.zip # Build empaquetado (usar en Brave/Chrome/Edge)
├── src/
│   ├── manifest.json        # Configuración Manifest V3
│   ├── background/
│   │   └── background.js    # Service worker (interceptor)
│   ├── content/
│   │   ├── content.js       # Lógica principal + algoritmo + PDF
│   │   ├── content.css      # Estilos en página
│   │   └── tokenAlgorithm.js # Algoritmo de tokens (no usado)
│   ├── popup/
│   │   ├── popup.html       # UI con panel debug
│   │   ├── popup.js         # Lógica popup + logging
│   │   └── popup.css        # Estilos popup
│   ├── sandbox/
│   │   ├── sandbox.html     # Iframe aislado
│   │   └── sandbox.js       # Ejecución del algoritmo
│   ├── modules/
│   │   └── updater.js       # Verificador de actualizaciones
│   ├── pdfmake.min.js       # Librería PDF (para build)
│   └── vfs_fonts.js         # Fuentes PDF (para build)
└── dist/                    # Build output (no versionado)
```

---

## Comandos Útiles

```powershell
# Ejecutar build
.\build.ps1

# Crear ZIP desde dist
cd dist
Compress-Archive -Path "*" -DestinationPath "..\score-grabber-v1.0.0.zip"

# Verificar content.js
node -c dist\content.js

# Verificar manifest
node -e "JSON.parse(require('fs').readFileSync('dist\manifest.json', 'utf8'))"
```
13. **No copiar CSP del manifest original** - puede tener valores inválidos

---

## Próximos Pasos

### Prioridad Alta
1. ✅ ~~Implementar descarga de múltiples páginas~~ (hecho)
2. **Generar PDF con pdfmake** - Combinar todas las páginas en un solo PDF
3. **Probar PDF completo** con el usuario

### Prioridad Media
4. Agregar progreso de descarga en la UI
5. Manejar errores de red mejor

### Prioridad Baja
6. Implementar soporte para conversión (MusicXML, MSCZ)
7. Mejorar UI con más opciones

---

## Archivos del Proyecto

```
score-grabber/
├── PLAN_TRABAJO.md          # Este archivo
├── README.md                # Documentación básica
├── package.json             # NPM config
├── score-grabber-v1.0.0.zip # Build empaquetado
├── src/
│   ├── manifest.json        # Configuración Manifest V3
│   ├── background/
│   │   └── background.js    # Service worker (interceptor)
│   ├── content/
│   │   ├── content.js       # Lógica principal + algoritmo
│   │   └── content.css      # Estilos en página
│   ├── popup/
│   │   ├── popup.html       # UI con panel debug
│   │   ├── popup.js         # Lógica popup + logging
│   │   └── popup.css        # Estilos popup
│   ├── sandbox/
│   │   ├── sandbox.html     # Iframe aislado
│   │   └── sandbox.js       # Ejecución del algoritmo
│   └── modules/
│       └── updater.js       # Verificador de actualizaciones
└── icons/
    └── icon.svg             # Icono (no usado aún)
```

---

## Pruebas Realizadas

| Fecha | Acción | Resultado |
|-------|--------|-----------|
| 26-06-2026 | Instalación ZIP | ✅ Funciona después de aplanar estructura |
| 26-06-2026 | Detección de página | ✅ Funciona con activeTab |
| 26-06-2026 | **Descarga MIDI** | ✅ **Funciona correctamente** |
| 26-06-2026 | **Descarga MP3** | ✅ **Funciona y reproduce** |
| 26-06-2026 | **Open Sheet** | ✅ **Abre imagen** |
| 26-06-2026 | **Descarga PDF** | ✅ **Genera PDF completo (Brave)** |
| 26-06-2026 | **Conversión SVG** | ✅ **Funciona correctamente** |
| 26-06-2026 | **Detección páginas** | ✅ **5 métodos implementados** |
| 26-06-2026 | Token Algorithm v1 | ❌ Sandbox timeout 5s |
| 26-06-2026 | Token Algorithm v2 | ❌ Sandbox timeout 15s |
| 26-06-2026 | Scrape mejorado | ❌ No captura tokens |
| 26-06-2026 | Logs detallados | ✅ Logs visibles en popup |
| 26-06-2026 | Script end fix | ✅ Step 2 ahora funciona |
| 26-06-2026 | CSP fix | ✅ Corregido con sección sandbox |
| 26-06-2026 | Canal de mensajes fix | ✅ Respuesta inmediata + asíncrona |
| 26-06-2026 | PDF con 2 páginas | ⚠️ Detección incorrecta |
| 26-06-2026 | PDF con todas páginas | ✅ Detección mejorada |
| 26-06-2026 | CAPTCHA Comet | ⚠️ Restricción del explorador |
| 26-06-2026 | **Prueba Brave** | ✅ **Funciona completamente** |

---

## Estado Actual

### Funciona (v10)
- ✅ Detección de página de MuseScore
- ✅ Extracción de scoreId, scoreName, scoreComposer
- ✅ Extracción de randomToken del script de MuseScore
- ✅ Búsqueda de función MD5 (#90605)
- ✅ Modificación del script (Step 1, 2, 3)
- ✅ Envío del script al sandbox
- ✅ Logs detallados en popup
- ✅ Log history persistente en storage
- ✅ **Token algorithm genera tokens válidos**
- ✅ **API responde con URLs de imágenes**
- ✅ **Descarga MIDI funciona**
- ✅ **Descarga MP3 funciona y reproduce**
- ✅ **Open Sheet abre imagen**

### Parcialmente Funciona
- ⚠️ **PDF**: Solo descarga primera página (PNG)

### No Funciona
- ❌ Método scrape no captura tokens

### Falta Realizar
- ⏳ Generar PDF con TODAS las páginas
- ⏳ Usar pdfmake para combinar páginas en PDF

---

## Estado del Proyecto
- **Fecha inicio:** 2026-06-26
- **Estado:** 🎉 FUNCIONAL - MIDI, MP3, Open Sheet funcionan. PDF solo primera página
- **Versión actual:** 1.0.0 (v10 - extensión funcional)
- **Licencia:** MIT

---

## Comandos Útiles

```powershell
# Ver ZIP
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("path\file.zip")
$zip.Entries | Select-Object FullName
$zip.Dispose()

# Validar JSON
node -e "JSON.parse(require('fs').readFileSync('file.json', 'utf8'))"
```
