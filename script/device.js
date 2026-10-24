/*
  device.js
  Works out what kind of screen and hardware we are running on, so the rest of
  the app can pick sensible settings for grid size, frame rate and effects.
*/
var device = (function() {
    var ua = navigator.userAgent || '';
    var platform = navigator.platform || '';

    // iPadOS 13+ reports itself as a Mac, so a "Mac" with a touch screen is really an iPad
    var isIPad = /iPad/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isIPhone = /iPhone|iPod/.test(ua);
    var isIOS = isIPad || isIPhone;
    var isAndroid = /Android/i.test(ua);

    // Small helper so we never throw on very old browsers without matchMedia
    function media(query) {
        return window.matchMedia ? window.matchMedia(query).matches : false;
    }

    // Is the page running as an installed home-screen app?
    var standalone = media('(display-mode: standalone)') || window.navigator.standalone === true;

    // Fullscreen exists on desktops and iPads, but not on iPhone Safari
    var canFullscreen = !standalone && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

    // Read the current screen and decide how hard we can push it
    function measure() {
        var w = window.innerWidth;
        var h = window.innerHeight;
        var shortSide = Math.min(w, h);

        // A touch screen as the main input means phone or tablet
        var touch = media('(pointer: coarse)') || isIOS || isAndroid;

        // Phone, tablet or desktop? Touch devices are told apart by their size
        var kind = 'desktop';
        if (isIPad) {
            kind = 'tablet';
        } else if (isIPhone) {
            kind = 'phone';
        } else if (touch) {
            kind = shortSide < 600 ? 'phone' : 'tablet';
        }

        // Rough hardware tier. The app also watches its own frame times and
        // backs off further if this guess turns out to be too optimistic.
        var cores = navigator.hardwareConcurrency || 4;
        var memory = navigator.deviceMemory || 4;
        var saveData = !!(navigator.connection && navigator.connection.saveData);
        var tier = 'mid';
        if (saveData || memory <= 2 || (!isIOS && cores <= 2)) {
            tier = 'low';
        } else if (kind === 'desktop' && cores >= 8) {
            tier = 'high';
        } else if (isIPad) {
            tier = 'high'; // iPads are quick, and their screens are big
        }

        // Retina screens get crisp text, but 3x on a phone is wasted work
        var dprCap = tier === 'high' ? 3 : 2;
        var dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, dprCap));

        // How big is one letter, in CSS pixels? Small enough for detail,
        // large enough to stay readable on the screen in your hand.
        var fontPx;
        if (kind === 'phone') {
            fontPx = 9;
        } else if (kind === 'tablet') {
            fontPx = 10.5;
        } else {
            fontPx = w >= 2400 ? 17 : (w >= 1700 ? 14 : 12);
        }

        // Frame rate ceiling for the generative scenes (camera video is capped at 30 by the app)
        var fps = tier === 'low' ? 24 : (tier === 'high' ? 60 : 30);

        return {
            w: w,
            h: h,
            dpr: dpr,
            kind: kind,
            tier: tier,
            touch: touch,
            portrait: h > w,
            fontPx: fontPx,
            fps: fps,
            reducedMotion: media('(prefers-reduced-motion: reduce)'),
            prefersLight: media('(prefers-color-scheme: light)'),
            ios: isIOS,
            canFullscreen: canFullscreen,
            standalone: standalone
        };
    }

    return {
        measure: measure
    };
})();
