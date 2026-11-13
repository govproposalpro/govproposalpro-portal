  // iPhone app (mobile/ in this repo). The app is a native shell that loads this same page, and
  // Capacitor gives it window.Capacitor with the native plugins. Everything here does nothing in
  // a normal browser.
  //  - Print and Save as PDF: WKWebView ignores window.print(), so it opens the iOS print sheet.
  //  - Downloads (Word, CSV): saved to the phone and handed to the iOS share sheet.
  //  - Push notifications: deadline reminders and "your proposal is ready" (src/services/apns.js).
  //  - No prices, checkout or upgrade links anywhere in the app (Apple guideline 3.1.3(f)).

  const NATIVE = Boolean(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  const nativeState = { pushToken: null, pushAsked: false };
  const nativePlugin = (name) => (NATIVE && window.Capacitor.Plugins ? window.Capacitor.Plugins[name] || null : null);
  const nativeCancelled = (err) => /cancel/i.test((err && (err.message || err.errorMessage)) || '');

  /** Writes a file to the app's cache folder and opens the share sheet (Save to Files, Mail, AirDrop). */
  async function nativeSave(name, blob) {
    const fs = nativePlugin('Filesystem');
    const share = nativePlugin('Share');
    if (!fs || !share) throw new Error('Saving files is not available in this version of the app.');
    const safe = String(name).replace(/[^\w.\- ]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'GovProposalPro-file';
    const data = await readBase64(blob);
    const { uri } = await fs.writeFile({ path: safe, data, directory: 'CACHE' });
    try {
      await share.share({ title: safe, files: [uri] });
    } catch (err) {
      if (!nativeCancelled(err)) throw err;
    }
  }

  /** Asks for notification permission once per session after sign-in, then registers the phone. */
  async function nativeEnablePush() {
    const push = nativePlugin('PushNotifications');
    if (!push || nativeState.pushAsked) return;
    nativeState.pushAsked = true;
    try {
      let { receive } = await push.checkPermissions();
      if (receive === 'prompt' || receive === 'prompt-with-rationale') ({ receive } = await push.requestPermissions());
      if (receive === 'granted') await push.register();
    } catch { /* notifications are optional */ }
  }

  /** On sign out: stop sending this member's notifications to this phone. */
  async function nativeForgetDevice() {
    nativeState.pushAsked = false;
    if (!nativeState.pushToken) return;
    await api('/devices', { method: 'DELETE', body: { token: nativeState.pushToken } }).catch(() => {});
  }

  function nativeInit() {
    if (!NATIVE) return;
    document.documentElement.classList.add('gpp-native');
    // Draw under the status bar and home indicator (the CSS pads with the safe-area insets), and stop
    // iOS zooming in when a small form field gets focus.
    const vp = $('meta[name=viewport]');
    if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover');
    const bar = nativePlugin('StatusBar');
    if (bar) bar.setStyle({ style: 'DARK' }).catch(() => {});

    const printer = nativePlugin('NativePrint');
    if (printer) {
      window.print = () => {
        printer.printPage({ name: document.title || 'GovProposalPro' })
          .catch((err) => { if (!nativeCancelled(err)) toast(err.message || 'Could not open printing.', 'error'); });
      };
    }

    const push = nativePlugin('PushNotifications');
    if (push) {
      push.addListener('registration', ({ value }) => {
        nativeState.pushToken = value;
        api('/devices', { method: 'POST', body: { token: value } }).catch(() => {});
      });
      // Tapping a notification opens the page it is about.
      push.addListener('pushNotificationActionPerformed', ({ notification }) => {
        const p = notification && notification.data && notification.data.path;
        if (typeof p === 'string' && /^\/app(\/[\w\-/]*)?$/.test(p)) navigate(p.replace(/^\/app/, '') || '/');
      });
    }

    // Coming back to the app: refresh the page's data if it has been in the background a while.
    const appPlugin = nativePlugin('App');
    if (appPlugin) {
      let hiddenAt = 0;
      appPlugin.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) { hiddenAt = Date.now(); return; }
        if (hiddenAt && Date.now() - hiddenAt > 10 * 60 * 1000 && state.me) render();
      });
    }
  }

  nativeInit();
