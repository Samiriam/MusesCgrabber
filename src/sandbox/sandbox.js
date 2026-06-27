// Sandbox - Ejecutar script de generación de tokens de MuseScore
// Devuelve true solo si window.generateToken se establece realmente

(function() {
  'use strict';

  var script = null;

  window.addEventListener('message', function(e) {
    if (typeof e.data !== 'object' || !e.data) return;

    if (e.data.executeScript) {
      script = e.data.executeScript;
      var isExecuted = false;

      console.log('[Sandbox] Script recibido, tamaño:', script.script.length);
      console.log('[Sandbox] Token aleatorio:', script.randomToken);

      try {
        // Ejecutar el script
        console.log('[Sandbox] Ejecutando script...');
        var startTime = Date.now();
        new Function(script.script)();
        var endTime = Date.now();
        console.log('[Sandbox] Script ejecutado en', (endTime - startTime), 'ms');

        // Esperar un poco para que el script se inicialice completamente
        // Algunos scripts necesitan tiempo para configurar window.generateToken
        setTimeout(function() {
          isExecuted = typeof window.generateToken === 'function';

          if (!isExecuted) {
            console.error('[Sandbox] generateToken no se estableció después de la ejecución');
            console.log('[Sandbox] Tipo de window.generateToken:', typeof window.generateToken);
            console.log('[Sandbox] Funciones window disponibles:', Object.keys(window).filter(k => k.includes('generate') || k.includes('Token')));
          } else {
            console.log('[Sandbox] generateToken está listo');
            // Probar la función
            try {
              var testToken = window.generateToken('test123');
              console.log('[Sandbox] Prueba de generación de token:', testToken);
            } catch (testErr) {
              console.error('[Sandbox] Falló la prueba de generación de token:', testErr);
            }
          }

          e.source.postMessage({ msdExecuteScript: isExecuted }, e.origin);
        }, 500);
      } catch (err) {
        console.error('[Sandbox] Falló la ejecución del script:', err);
        console.error('[Sandbox] Stack de error:', err.stack);
        e.source.postMessage({ msdExecuteScript: false, error: err.message }, e.origin);
      }
    } else if (e.data.generateToken) {
      var data = e.data.generateToken;
      var token = null;

      console.log('[Sandbox] Generando token para:', data);

      try {
        if (typeof window.generateToken === 'function') {
          var input = data.id + data.type + data.index + (script ? script.randomToken : '');
          console.log('[Sandbox] Entrada para generateToken:', input);
          token = window.generateToken(input);
          console.log('[Sandbox] Token generado:', token);
          if (token && token.substring) {
            token = token.substring(0, 4);
            console.log('[Sandbox] Token final (4 caracteres):', token);
          }
        } else {
          console.error('[Sandbox] generateToken no es una función');
        }
      } catch (err) {
        console.error('[Sandbox] Falló la generación de token:', err);
        console.error('[Sandbox] Stack de error:', err.stack);
      }

      e.source.postMessage({ msdGenerateToken: token }, e.origin);
    }
  });

  console.log('[Sandbox] Sandbox inicializado y escuchando');
})();