# Score Grabber

Extensión de navegador para descargar partituras, archivos de audio y MIDI de MuseScore.

## Características

- Descargar archivos MIDI
- Descargar audio MP3
- Descargar partituras (PDF)
- Ver partituras directamente

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

## Estructura

```
src/
├── manifest.json          # Configuración de la extensión
├── background/
│   └── background.js      # Intercepta tokens de API
├── content/
│   ├── content.js         # Lógica principal
│   └── content.css        # Estilos del contenido
├── popup/
│   ├── popup.html         # Interfaz del popup
│   ├── popup.js           # Lógica del popup
│   └── popup.css          # Estilos del popup
└── sandbox/
    ├── sandbox.html       # Ejecución aislada
    └── sandbox.js         # Generación de tokens
```

## Desarrollo

1. Realizar cambios en los archivos de `src/`
2. Recargar la extensión en el navegador
3. Actualizar cualquier página de MuseScore

## Notas

- Esta extensión usa la API interna de MuseScore
- Usar solo con fines educativos
- El algoritmo de tokens puede necesitar actualizaciones si MuseScore cambia su sistema

## Licencia

MIT