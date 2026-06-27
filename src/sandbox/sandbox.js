// Sandbox - Execute MuseScore's token generation script
// Returns true only if window.generateToken is actually set

(function() {
  'use strict';

  var script = null;

  window.addEventListener('message', function(e) {
    if (typeof e.data !== 'object' || !e.data) return;

    if (e.data.executeScript) {
      script = e.data.executeScript;
      var isExecuted = false;

      console.log('[Sandbox] Received script, size:', script.script.length);
      console.log('[Sandbox] Random token:', script.randomToken);

      try {
        // Execute the script
        console.log('[Sandbox] Executing script...');
        var startTime = Date.now();
        new Function(script.script)();
        var endTime = Date.now();
        console.log('[Sandbox] Script executed in', (endTime - startTime), 'ms');

        // Wait a bit for the script to fully initialize
        // Some scripts need time to set up window.generateToken
        setTimeout(function() {
          isExecuted = typeof window.generateToken === 'function';

          if (!isExecuted) {
            console.error('[Sandbox] generateToken not set after execution');
            console.log('[Sandbox] window.generateToken type:', typeof window.generateToken);
            console.log('[Sandbox] Available window functions:', Object.keys(window).filter(k => k.includes('generate') || k.includes('Token')));
          } else {
            console.log('[Sandbox] generateToken is ready');
            // Test the function
            try {
              var testToken = window.generateToken('test123');
              console.log('[Sandbox] Test token generation:', testToken);
            } catch (testErr) {
              console.error('[Sandbox] Test token generation failed:', testErr);
            }
          }

          e.source.postMessage({ msdExecuteScript: isExecuted }, e.origin);
        }, 500);
      } catch (err) {
        console.error('[Sandbox] Script execution failed:', err);
        console.error('[Sandbox] Error stack:', err.stack);
        e.source.postMessage({ msdExecuteScript: false, error: err.message }, e.origin);
      }
    } else if (e.data.generateToken) {
      var data = e.data.generateToken;
      var token = null;

      console.log('[Sandbox] Generating token for:', data);

      try {
        if (typeof window.generateToken === 'function') {
          var input = data.id + data.type + data.index + (script ? script.randomToken : '');
          console.log('[Sandbox] Input for generateToken:', input);
          token = window.generateToken(input);
          console.log('[Sandbox] Generated token:', token);
          if (token && token.substring) {
            token = token.substring(0, 4);
            console.log('[Sandbox] Final token (4 chars):', token);
          }
        } else {
          console.error('[Sandbox] generateToken is not a function');
        }
      } catch (err) {
        console.error('[Sandbox] Token generation failed:', err);
        console.error('[Sandbox] Error stack:', err.stack);
      }

      e.source.postMessage({ msdGenerateToken: token }, e.origin);
    }
  });

  console.log('[Sandbox] Sandbox initialized and listening');
})();
