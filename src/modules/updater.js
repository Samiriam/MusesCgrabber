// Verificador de actualizaciones automáticas para la extensión MuseScore Downloader

const UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 horas

class UpdateChecker {
  constructor(config = {}) {
    this.repoOwner = config.repoOwner || 'ingui-n';
    this.repoName = config.repoName || 'musescore-downloader';
    this.currentVersion = config.currentVersion || '1.0.0';
    this.githubApiUrl = `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/releases/latest`;
    this.storageKey = 'extension_update_info';
    this.checkInterval = null;
  }

  // Iniciar verificaciones periódicas de actualizaciones
  start() {
    this.checkNow(); // Verificar inmediatamente
    this.checkInterval = setInterval(() => this.checkNow(), UPDATE_CHECK_INTERVAL);
    console.log('[UpdateChecker] Iniciado, verificando cada 6 horas');
  }

  // Detener verificaciones periódicas
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // Verificar actualizaciones ahora
  async checkNow() {
    try {
      console.log('[UpdateChecker] Verificando actualizaciones...');
      
      const response = await fetch(this.githubApiUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'MuseScore-Downloader-Extension'
        }
      });

      if (!response.ok) {
        throw new Error(`Error de API GitHub: ${response.status}`);
      }

      const release = await response.json();
      
      const updateInfo = {
        available: false,
        latestVersion: release.tag_name?.replace('v', '') || '0.0.0',
        currentVersion: this.currentVersion,
        releaseDate: release.published_at,
        releaseUrl: release.html_url,
        downloadUrl: this.getDownloadUrl(release),
        releaseNotes: release.body || '',
        checkedAt: new Date().toISOString()
      };

      // Comparar versiones
      updateInfo.available = this.isNewerVersion(
        updateInfo.currentVersion,
        updateInfo.latestVersion
      );

      // Guardar información de actualización
      await chrome.storage.local.set({ [this.storageKey]: updateInfo });

      // Mostrar notificación si hay actualización disponible
      if (updateInfo.available) {
        this.showNotification(updateInfo);
      }

      console.log('[UpdateChecker] Resultado:', updateInfo);
      return updateInfo;

    } catch (error) {
      console.error('[UpdateChecker] Verificación fallida:', error);
      return { available: false, error: error.message };
    }
  }

  // Obtener URL de descarga de la extensión desde los assets del release
  getDownloadUrl(release) {
    if (!release.assets || release.assets.length === 0) {
      return release.html_url;
    }

    // Buscar archivo ZIP (Chrome/Edge)
    const zipAsset = release.assets.find(a => 
      a.name.endsWith('.zip') && a.name.includes('manifest-v3')
    );
    if (zipAsset) return zipAsset.browser_download_url;

    // Usar primer asset como respaldo
    return release.assets[0].browser_download_url;
  }

  // Comparar versiones semánticas
  isNewerVersion(current, latest) {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if ((latestParts[i] || 0) > (currentParts[i] || 0)) return true;
      if ((latestParts[i] || 0) < (currentParts[i] || 0)) return false;
    }
    return false;
  }

  // Mostrar notificación del navegador
  showNotification(updateInfo) {
    if (chrome.notifications) {
      chrome.notifications.create('update-available', {
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: 'Actualización de MuseScore Downloader',
        message: `Versión ${updateInfo.latestVersion} disponible (actual: ${updateInfo.currentVersion})`,
        buttons: [{ title: 'Ver actualización' }],
        requireInteraction: true
      });
    }
  }

  // Obtener información de actualización almacenada
  async getStoredInfo() {
    const result = await chrome.storage.local.get(this.storageKey);
    return result[this.storageKey] || null;
  }

  // Forzar verificación y devolver promesa
  async forceCheck() {
    return await this.checkNow();
  }
}

// Exportar para usar en background.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UpdateChecker;
}