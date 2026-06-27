// Auto-update checker for MuseScore Downloader Extension

const UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

class UpdateChecker {
  constructor(config = {}) {
    this.repoOwner = config.repoOwner || 'ingui-n';
    this.repoName = config.repoName || 'musescore-downloader';
    this.currentVersion = config.currentVersion || '1.0.0';
    this.githubApiUrl = `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/releases/latest`;
    this.storageKey = 'extension_update_info';
    this.checkInterval = null;
  }

  // Start periodic update checks
  start() {
    this.checkNow(); // Check immediately
    this.checkInterval = setInterval(() => this.checkNow(), UPDATE_CHECK_INTERVAL);
    console.log('[UpdateChecker] Started, checking every 6 hours');
  }

  // Stop periodic checks
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // Check for updates now
  async checkNow() {
    try {
      console.log('[UpdateChecker] Checking for updates...');
      
      const response = await fetch(this.githubApiUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'MuseScore-Downloader-Extension'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
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

      // Compare versions
      updateInfo.available = this.isNewerVersion(
        updateInfo.currentVersion,
        updateInfo.latestVersion
      );

      // Store update info
      await chrome.storage.local.set({ [this.storageKey]: updateInfo });

      // Show notification if update available
      if (updateInfo.available) {
        this.showNotification(updateInfo);
      }

      console.log('[UpdateChecker] Result:', updateInfo);
      return updateInfo;

    } catch (error) {
      console.error('[UpdateChecker] Check failed:', error);
      return { available: false, error: error.message };
    }
  }

  // Get download URL for the extension from release assets
  getDownloadUrl(release) {
    if (!release.assets || release.assets.length === 0) {
      return release.html_url;
    }

    // Look for ZIP file (Chrome/Edge)
    const zipAsset = release.assets.find(a => 
      a.name.endsWith('.zip') && a.name.includes('manifest-v3')
    );
    if (zipAsset) return zipAsset.browser_download_url;

    // Fallback to first asset
    return release.assets[0].browser_download_url;
  }

  // Compare semantic versions
  isNewerVersion(current, latest) {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if ((latestParts[i] || 0) > (currentParts[i] || 0)) return true;
      if ((latestParts[i] || 0) < (currentParts[i] || 0)) return false;
    }
    return false;
  }

  // Show browser notification
  showNotification(updateInfo) {
    if (chrome.notifications) {
      chrome.notifications.create('update-available', {
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: 'MuseScore Downloader Update',
        message: `Version ${updateInfo.latestVersion} is available (current: ${updateInfo.currentVersion})`,
        buttons: [{ title: 'View Update' }],
        requireInteraction: true
      });
    }
  }

  // Get stored update info
  async getStoredInfo() {
    const result = await chrome.storage.local.get(this.storageKey);
    return result[this.storageKey] || null;
  }

  // Force check and return promise
  async forceCheck() {
    return await this.checkNow();
  }
}

// Export for use in background.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UpdateChecker;
}
