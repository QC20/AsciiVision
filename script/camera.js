/*
    camera.js
    Based on camera.js v1.1 by Andrei Gheorghe (MIT License), rewritten to use the
    modern promise-based mediaDevices API.

    It hands out the <video> element itself. The renderer reads frames straight from
    it, so there is no intermediate canvas to keep in sync.
*/
var camera = (function() {
    var video = null;
    var stream = null;
    var track = null;
    var facing = 'user';      // 'user' = front camera, 'environment' = rear camera
    var cameraCount = 0;      // how many cameras the device has (decides whether we show a flip button)
    var starting = null;      // the start() currently in flight, so double-calls share it
    var onEnded = function() {};

    // getUserMedia only exists on https:// pages and on localhost
    function supported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    // The video element lives in the page (hidden), because iOS Safari is happier decoding a video that is attached
    function ensureVideo() {
        if (video) return video;
        video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.setAttribute('muted', '');
        video.setAttribute('aria-hidden', 'true');
        video.playsInline = true;
        video.muted = true;
        video.autoplay = true;
        video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;';
        document.body.appendChild(video);
        return video;
    }

    // Switch the camera off completely, so the camera light goes out
    function release() {
        if (stream) {
            stream.getTracks().forEach(function(t) {
                t.onended = null;
                t.stop();
            });
        }
        stream = null;
        track = null;
        if (video) {
            video.pause();
            video.srcObject = null;
        }
    }

    // Ask for a modest 4:3 picture. We only need a few thousand pixels, so a small stream keeps phones cool.
    function request(wanted) {
        var nice = {
            audio: false,
            video: {
                facingMode: { ideal: wanted },
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 30, max: 60 }
            }
        };
        return navigator.mediaDevices.getUserMedia(nice).catch(function(err) {
            // Some webcams are picky: if our wishes can't be met, take whatever they offer
            if (err && /Overconstrained|ConstraintNotSatisfied|TypeError/.test(err.name)) {
                return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
            }
            throw err;
        });
    }

    // Wait until the video really has a picture (or give up after a few seconds)
    function firstFrame(v) {
        return new Promise(function(resolve, reject) {
            var waited = 0;
            (function poll() {
                if (v.readyState >= 2 && v.videoWidth > 0) return resolve();
                waited += 50;
                if (waited > 5000) {
                    var err = new Error('The camera never produced a picture');
                    err.name = 'NotReadableError';
                    return reject(err);
                }
                setTimeout(poll, 50);
            })();
        });
    }

    function countCameras() {
        if (!navigator.mediaDevices.enumerateDevices) return Promise.resolve();
        return navigator.mediaDevices.enumerateDevices().then(function(list) {
            cameraCount = list.filter(function(d) { return d.kind === 'videoinput'; }).length;
        }).catch(function() {});
    }

    function describe() {
        return {
            facing: facing,
            mirror: facing !== 'environment',
            width: video ? video.videoWidth : 0,
            height: video ? video.videoHeight : 0,
            cameras: cameraCount
        };
    }

    // Open the camera. Resolves when pictures are flowing, rejects with a DOMException-like error otherwise.
    function start(wanted) {
        if (starting) return starting;
        if (!supported()) {
            var unsupported = new Error('No camera API on this page');
            unsupported.name = 'NotSupportedError';
            return Promise.reject(unsupported);
        }

        release();
        starting = request(wanted || facing).then(function(s) {
            stream = s;
            track = s.getVideoTracks()[0];
            var settings = track.getSettings ? track.getSettings() : {};
            facing = settings.facingMode || wanted || 'user';
            track.onended = function() { onEnded(); };

            var v = ensureVideo();
            v.srcObject = s;
            return v.play().catch(function() {}).then(function() { return firstFrame(v); });
        }).then(function() {
            return countCameras();
        }).then(function() {
            starting = null;
            return describe();
        }, function(err) {
            starting = null;
            release();
            throw err;
        });
        return starting;
    }

    // Swap between the front and rear camera. If that fails, go back to the one we had.
    function flip() {
        var previous = facing;
        return start(previous === 'user' ? 'environment' : 'user').catch(function(err) {
            return start(previous).then(function() { throw err; });
        });
    }

    // Translate the browser's error names into the handful of situations we have something to say about
    function explain(err) {
        if (!supported()) {
            return window.isSecureContext === false ? 'insecure' : 'unsupported';
        }
        var name = (err && err.name) || '';
        if (/NotAllowed|PermissionDenied|Security/.test(name)) return 'denied';
        if (/NotFound|DevicesNotFound|Overconstrained/.test(name)) return 'missing';
        if (/NotReadable|TrackStart|Abort/.test(name)) return 'busy';
        return 'unknown';
    }

    // Has the browser already been told yes or no? (Chrome and Firefox can tell us; Safari can't.)
    function permission() {
        if (!navigator.permissions || !navigator.permissions.query) return Promise.resolve('unknown');
        return navigator.permissions.query({ name: 'camera' }).then(function(status) {
            return status.state; // 'granted', 'denied' or 'prompt'
        }).catch(function() { return 'unknown'; });
    }

    return {
        supported: supported,
        start: start,
        stop: release,
        flip: flip,
        explain: explain,
        permission: permission,
        // Is a live picture flowing right now?
        alive: function() { return !!track && track.readyState === 'live' && !!video && video.readyState >= 2; },
        info: describe,
        get video() { return video; },
        get mirror() { return facing !== 'environment'; },
        get cameras() { return cameraCount; },
        // Called when the stream dies by itself (unplugged, or iOS took it while the app was in the background)
        set onEnded(fn) { onEnded = fn || function() {}; }
    };
})();
