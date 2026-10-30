/*
  app.js
  Jonas Kjeldmand Jensen
  May 2024, rebuilt 2026

  The conductor. It owns the render loop, the controls and the self-running intro,
  and wires the other modules together:

      device    what are we running on?
      camera    the live video
      scenes    the generative show used before / instead of the camera
      ascii     turns brightness into letters on the canvas
      narrator  captions and voice

  Handy URL options:  ?theme=auto|ink|phosphor|paper|amber|color   ?glyphs=classic|dense|blocks|binary
                      ?camera=off   ?voice=on   ?intro=off   ?scene=plasma|donut|lava   ?debug
*/
(function() {
    var root = document.documentElement;
    var params = new URLSearchParams(window.location.search);

    function $(id) {
        return document.getElementById(id);
    }

    function wait(ms) {
        return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }

    function cap(text) {
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    // Remember settings between visits. Private mode or blocked storage must never break the app.
    var store = {
        get: function(key) {
            try { return window.localStorage.getItem('asciivision.' + key); } catch (e) { return null; }
        },
        set: function(key, value) {
            try { window.localStorage.setItem('asciivision.' + key, value); } catch (e) {}
        }
    };

    function hexToRgb(hex) {
        var n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    // ---------- Themes ----------
    // lightOnDark: bright parts of the picture get the fullest characters (like light on a dark screen).
    // Paper is the opposite, like a printed photo: bright parts stay empty and shadows get the ink.
    var themes = {
        phosphor: { id: 'phosphor', name: 'phosphor', bg: '#020a05', fg: '#39ff7a', accent: '#39ff7a', lightOnDark: true, glow: 0.65 },
        ink: { id: 'ink', name: 'ink', bg: '#08080a', fg: '#f1f1ec', accent: '#ff6a3d', lightOnDark: true, glow: 0.2 },
        paper: { id: 'paper', name: 'paper', bg: '#f2eee4', fg: '#16130e', accent: '#e4572e', lightOnDark: false, glow: 0 },
        amber: { id: 'amber', name: 'amber', bg: '#140a00', fg: '#ffb21f', accent: '#ffb21f', lightOnDark: true, glow: 0.6 },
        color: { id: 'color', name: 'colour', bg: '#040406', fg: '#ffffff', accent: '#ff5fa2', lightOnDark: true, glow: 0.6, color: true }
    };
    var themeOrder = ['ink', 'phosphor', 'paper', 'amber', 'color'];
    themeOrder.forEach(function(id) { themes[id].rgb = hexToRgb(themes[id].fg); });

    // ---------- Icons ----------
    var ICONS = {
        pause: '<path d="M8 5v14M16 5v14"/>',
        play: '<path d="M7 4.5v15l12-7.5z"/>',
        camera: '<rect x="3" y="6.5" width="12.5" height="11" rx="2.5"/><path d="M15.5 10.5l5-3v9l-5-3"/>',
        cameraOff: '<rect x="3" y="6.5" width="12.5" height="11" rx="2.5"/><path d="M15.5 10.5l5-3v9l-5-3M3 3l18 18"/>',
        theme: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>',
        glyphs: '<text x="12" y="17.2" text-anchor="middle" font-size="15" font-weight="700" font-family="Menlo, Consolas, monospace" fill="currentColor" stroke="none">@</text>',
        flip: '<path d="M4 9a8 8 0 0 1 14-3.5L20 8M20 4v4h-4M20 15a8 8 0 0 1-14 3.5L4 16M4 20v-4h4"/>',
        snap: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.3-2h5.4L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/>',
        rec: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none"/>',
        stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.2" fill="currentColor" stroke="none"/>',
        full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
        fullExit: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'
    };

    function setButton(button, icon, label, title) {
        button.querySelector('.ico').innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[icon] + '</svg>';
        button.querySelector('.lbl').textContent = label;
        button.setAttribute('aria-label', label);
        if (title) button.title = title;
    }

    // ---------- Elements and state ----------
    var stage = $('stage');
    var chrome = $('chrome');
    var glowCanvas = $('glow');
    var toastEl = $('toast');
    var debugEl = $('debug');
    var buttons = {
        pause: $('btnPause'),
        camera: $('btnCamera'),
        theme: $('btnTheme'),
        glyphs: $('btnGlyphs'),
        flip: $('btnFlip'),
        snap: $('btnSnap'),
        rec: $('btnRec'),
        full: $('btnFull')
    };

    var profile = device.measure();
    var grid = null;
    var fields = null;
    var theme = null;
    var state = {
        paused: false,
        step: false,        // draw one frame even though we are paused (after a theme change, say)
        cameraLive: false,
        resume: false,      // the camera has been granted and the visitor has not turned it off
        mix: 0,             // 0 = generative scene, 1 = live camera; eased in between for the cross-fade
        scale: 1,           // grows when the device struggles, which makes the letters bigger and fewer
        glyphs: 'classic'
    };
    var pointer = { x: 0, y: 0, energy: 0, down: false };

    // ---------- Layout ----------

    // (Re)build the letter grid for the current screen
    function relayout() {
        profile = device.measure();
        grid = ascii.layout(profile, state.scale);
        fields = {
            demo: ascii.createField(),
            cam: ascii.createField(),
            out: ascii.createField()
        };
        scenes.resize(grid, profile);

        // Soften the glow in proportion to the letter size; skip the blur on weak devices
        glowCanvas.style.filter = profile.tier === 'low' ? 'none' : 'blur(' + Math.round(grid.cellW * 1.4) + 'px)';
        state.step = true;
        resetPerf();
    }

    var resizeTimer = 0;
    function scheduleRelayout(delay) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            var p = device.measure();
            if (p.w !== profile.w || p.h !== profile.h || p.dpr !== profile.dpr) relayout();
        }, delay || 150);
    }

    // ---------- Themes and glyphs ----------

    // "auto" follows the device, live: a dark screen gets ink (pale letters on near-black), a light one gets paper.
    // A browser that reports no preference at all gets night between 19:00 and 07:00 instead.
    var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    var lightQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
    var themeMode = 'auto';
    var modeOrder = ['auto'].concat(themeOrder);

    function systemIsDark() {
        if (darkQuery && darkQuery.matches) return true;
        if (lightQuery && lightQuery.matches) return false;
        var hour = new Date().getHours();
        return hour < 7 || hour >= 19;
    }

    // `mode` is "auto" or the id of one theme. Only a deliberate choice is remembered as a choice.
    function setTheme(mode, announce) {
        themeMode = (mode === 'auto' || themes[mode]) ? mode : 'auto';
        theme = themes[themeMode === 'auto' ? (systemIsDark() ? 'ink' : 'paper') : themeMode];
        var s = root.style;
        s.setProperty('--bg', theme.bg);
        s.setProperty('--fg', theme.fg);
        s.setProperty('--accent', theme.accent);
        s.setProperty('--glow', profile.tier === 'low' ? 0 : theme.glow);
        root.setAttribute('data-theme', theme.id);

        // Tint the phone's status bar / browser chrome to match. The page started with one tag per colour scheme;
        // from here on a single colour is right for both.
        var metas = document.querySelectorAll('meta[name="theme-color"]');
        for (var m = 0; m < metas.length; m++) {
            metas[m].setAttribute('content', theme.bg);
            metas[m].removeAttribute('media');
        }

        store.set('themeMode', themeMode);
        state.step = true;
        syncUI();
        if (announce) toast('Theme: ' + themeLabel());
    }

    function themeLabel() {
        return themeMode === 'auto' ? 'Auto (' + (theme.lightOnDark ? 'night' : 'day') + ')' : cap(theme.name);
    }

    function cycleTheme(direction) {
        var i = modeOrder.indexOf(themeMode) + (direction || 1);
        setTheme(modeOrder[(i + modeOrder.length) % modeOrder.length], true);
    }

    // When the system flips between light and dark (sunset, a schedule, the Control Centre toggle), so do we
    function onSchemeChange() {
        if (themeMode === 'auto') setTheme('auto', false);
    }
    [darkQuery, lightQuery].forEach(function(query) {
        if (!query) return;
        if (query.addEventListener) query.addEventListener('change', onSchemeChange);
        else if (query.addListener) query.addListener(onSchemeChange);
    });

    function setGlyphs(id, announce) {
        var set = ascii.setGlyphs(id);
        state.glyphs = set.id;
        store.set('glyphs', set.id);
        state.step = true;
        if (announce) toast('Characters: ' + cap(set.name));
    }

    function cycleGlyphs() {
        var sets = ascii.glyphSets;
        var index = 0;
        for (var i = 0; i < sets.length; i++) {
            if (sets[i].id === state.glyphs) index = i;
        }
        setGlyphs(sets[(index + 1) % sets.length].id, true);
    }

    // ---------- The frame ----------

    // Blend the generative scene and the camera into the one field that gets drawn
    function compose() {
        var out = fields.out;
        var d = fields.demo;
        var c = fields.cam;
        var m = state.mix;
        var n = grid.count;
        // Scenes are drawn as "amount of ink". On paper (dark ink) that is what the numbers already mean the other way round.
        var negate = !theme.lightOnDark;
        var ol = out.lum, dl = d.lum, cl = c.lum;
        var i, dv;

        if (m <= 0) {
            for (i = 0; i < n; i++) ol[i] = negate ? 1 - dl[i] : dl[i];
        } else if (m >= 1) {
            ol.set(cl);
        } else {
            for (i = 0; i < n; i++) {
                dv = negate ? 1 - dl[i] : dl[i];
                ol[i] = dv + (cl[i] - dv) * m;
            }
        }

        if (theme.color) {
            var od = out.color.data, dd = d.color.data, cd = c.color.data;
            if (m <= 0) {
                od.set(dd);
            } else if (m >= 1) {
                od.set(cd);
            } else {
                for (i = 0; i < n * 4; i++) od[i] = dd[i] + (cd[i] - dd[i]) * m;
            }
        }
    }

    // If the camera stream dies without telling us (another tab took it, say), don't sit on a frozen picture
    var deadSince = 0;
    function checkCamera(t) {
        if (!state.cameraLive || camera.alive()) {
            deadSince = 0;
        } else if (!deadSince) {
            deadSince = t;
        } else if (t - deadSince > 3) {
            deadSince = 0;
            state.cameraLive = false;
            syncUI();
            if (state.resume && !document.hidden) startCamera();
        }
    }

    function tick(t, dt) {
        checkCamera(t);
        var target = state.cameraLive ? 1 : 0;
        state.mix += (target - state.mix) * (1 - Math.exp(-dt * 2.4));
        if (Math.abs(target - state.mix) < 0.003) state.mix = target;

        pointer.energy = pointer.down ? Math.max(pointer.energy, 0.7) : pointer.energy * Math.exp(-dt * 1.4);

        if (state.mix < 1) {
            scenes.render(fields.demo, dt, pointer);
            if (theme.color) ascii.colorize(fields.demo, t);
        }
        if (state.mix > 0 && camera.alive()) {
            ascii.sampleVideo(camera.video, camera.mirror, fields.cam, theme.color);
        }
        compose();
        ascii.render(fields.out, theme);
    }

    // How many frames a second are we aiming for right now?
    function targetFps() {
        // Camera video is capped at 30 frames a second, which is plenty for letters
        return state.mix > 0.5 ? Math.min(30, profile.fps) : profile.fps;
    }

    // Watch how long frames take and how many we actually get. If the device can't keep up, use
    // bigger (and so fewer) letters. This is judged on a clock, not a frame count, so that the
    // slowest devices, which produce the fewest frames, are also the quickest to adapt.
    var perf = { ema: 0, frames: 0, since: 0, fps: 0, strikes: 0, checkAt: 0, warmUntil: 0 };
    var failed = false;
    var adaptive = !params.has('fixed');

    // Start judging afresh (after a resize, a rebuild of the grid, or coming back to the tab)
    function resetPerf() {
        var now = performance.now();
        perf.frames = 0;
        perf.since = now;
        perf.strikes = 0;
        perf.checkAt = 0;
        perf.warmUntil = now + 2500; // the first moments are always slow while the JIT warms up
    }

    function watch(ms, now) {
        perf.ema += (ms - perf.ema) * 0.15;
        perf.frames++;

        if (now - perf.since >= 500) {
            perf.fps = perf.frames * 1000 / (now - perf.since);
            perf.frames = 0;
            perf.since = now;
            if (!debugEl.hidden) {
                debugEl.textContent = Math.round(perf.fps) + ' fps  ' + grid.cols + 'x' + grid.rows +
                    '  ' + profile.kind + '/' + profile.tier + '  dpr ' + profile.dpr +
                    '\nscale ' + state.scale.toFixed(2) + '  work ' + perf.ema.toFixed(1) + 'ms  mix ' + state.mix.toFixed(2);
            }
        }

        if (!adaptive || now < perf.warmUntil) return;
        if (!perf.checkAt) perf.checkAt = now + 1500;
        if (now < perf.checkAt) return;
        perf.checkAt = now + 1500;

        // Too slow means: the drawing alone eats more than about half of a frame, or we get far fewer frames than we
        // ask for *and* our own work is not trivial. (A browser in power-saver mode may cap animation at 30 Hz,
        // and shrinking the picture would not help there.)
        var cap = targetFps();
        var tooSlow = perf.ema > Math.max(12, 1000 / cap * 0.55) || (perf.fps < cap * 0.55 && perf.ema > 6);
        if (!tooSlow) {
            perf.strikes = 0;
            return;
        }
        if (++perf.strikes >= 2 && state.scale < 1.7) {
            state.scale *= 1.22;
            relayout();
        }
    }

    var last = 0;
    function frame(now) {
        requestAnimationFrame(frame);

        if (now - last < 1000 / targetFps() - 2) return;
        var dt = Math.min(0.1, (now - last) / 1000);
        last = now;

        if (state.paused && !state.step) return;
        state.step = false;
        if (failed) return;

        var t0 = performance.now();
        try {
            tick(now / 1000, dt);
        } catch (e) {
            failed = true;
            if (window.console) console.error('[AsciiVision] stopped drawing:', e);
        }
        watch(performance.now() - t0, now);
    }

    // ---------- Toasts ----------
    var toastTimer = 0;
    function toast(text) {
        toastEl.textContent = text;
        toastEl.classList.add('on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function() { toastEl.classList.remove('on'); }, 1500);
    }

    // ---------- Controls ----------

    function syncUI() {
        setButton(buttons.pause, state.paused ? 'play' : 'pause', state.paused ? 'Resume' : 'Pause',
            state.paused ? 'Resume (Space)' : 'Pause (Space)');
        buttons.pause.classList.toggle('is-on', state.paused);

        setButton(buttons.camera, state.cameraLive ? 'camera' : 'cameraOff', 'Camera',
            state.cameraLive ? 'Turn camera off (C)' : 'Turn camera on (C)');
        buttons.camera.setAttribute('aria-pressed', state.cameraLive ? 'true' : 'false');

        setButton(buttons.theme, 'theme', 'Theme', 'Theme: ' + themeLabel() + ' (T, or swipe)');
        setButton(buttons.glyphs, 'glyphs', 'Glyphs', 'Change characters (G)');
        setButton(buttons.flip, 'flip', 'Flip', 'Front / rear camera (R)');
        buttons.flip.hidden = !(state.cameraLive && camera.cameras > 1);
        var photoPending = !!(counting && counting.kind === 'photo');
        setButton(buttons.snap, 'snap', 'Snap', photoPending ? 'Cancel the countdown (S)' : 'Take a picture in 3 seconds (S)');
        buttons.snap.classList.toggle('is-on', photoPending);

        var videoPending = !!(counting && counting.kind === 'video');
        buttons.rec.hidden = !canRecord;
        setButton(buttons.rec, recording ? 'stop' : 'rec', recording ? 'Stop' : 'Record',
            recording ? 'Stop recording (R)' : (videoPending ? 'Cancel the countdown (R)' : 'Record a video in 3 seconds (R)'));
        buttons.rec.classList.toggle('is-rec', !!recording);
        buttons.rec.classList.toggle('is-on', videoPending);

        buttons.full.hidden = !profile.canFullscreen;
        setButton(buttons.full, isFullscreen() ? 'fullExit' : 'full', 'Fullscreen', 'Fullscreen (F)');
    }

    function togglePause() {
        state.paused = !state.paused;
        state.step = true;
        resetPerf();
        syncUI();
        toast(state.paused ? 'Paused' : 'Resumed');
    }

    function toggleVoice() {
        var on = !narrator.voice;
        narrator.setVoice(on);
        store.set('voice', on ? '1' : '0');
        syncUI();
        if (on) narrator.confirm('Voice on.');
        else toast('Voice off');
    }

    function isFullscreen() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }

    function toggleFullscreen() {
        if (!profile.canFullscreen) return;
        var el = document.documentElement;
        try {
            if (isFullscreen()) {
                (document.exitFullscreen || document.webkitExitFullscreen).call(document);
            } else {
                (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
            }
        } catch (e) {}
    }

    // ---------- Saving ----------

    function fileStamp() {
        return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    }

    // Hand a finished picture or video over: the share sheet on phones and tablets, a download everywhere else
    function saveBlob(blob, name) {
        var file = null;
        try { file = new File([blob], name, { type: blob.type }); } catch (e) {}

        function download() {
            var link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(function() { URL.revokeObjectURL(link.href); }, 4000);
            toast('Saved ' + name);
        }

        if (file && profile.touch && navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: 'AsciiVision' }).catch(function(err) {
                // Closing the share sheet is a choice, not a failure. Being refused one is, so fall back to a download.
                if (!err || err.name !== 'AbortError') download();
            });
            return;
        }
        download();
    }

    // ---------- Pictures ----------

    function takeSnapshot() {
        var canvas = ascii.snapshot(theme);
        var flash = $('flash');
        flash.classList.remove('go');
        void flash.offsetWidth; // restart the CSS animation
        flash.classList.add('go');

        canvas.toBlob(function(blob) {
            if (!blob) return toast("Couldn't save the picture");
            saveBlob(blob, 'asciivision-' + fileStamp() + '.png');
        }, 'image/png');
    }

    // ---------- Countdown ----------
    // A photo or a recording starts after 3, 2, 1, so there is time to get ready.
    var countEl = $('count');
    var countNum = $('countNum');
    var countLabel = $('countLabel');
    var counting = null; // { kind, timer } while the numbers are on screen

    function cancelCountdown() {
        if (!counting) return;
        clearTimeout(counting.timer);
        counting = null;
        countEl.classList.remove('on');
        countEl.setAttribute('aria-hidden', 'true');
        syncUI();
    }

    // Starting the same thing again, tapping the number or pressing Escape cancels it
    function startCountdown(kind, label, go) {
        cancelCountdown();
        var n = 3;
        var me = counting = { kind: kind, timer: 0 };
        countLabel.textContent = label;
        countEl.classList.add('on');
        countEl.setAttribute('aria-hidden', 'false');
        hideHud(); // out of the way, so you can see yourself

        function show() {
            countNum.textContent = n;
            countNum.classList.remove('tick');
            void countNum.offsetWidth; // restart the CSS animation
            countNum.classList.add('tick');
            $('sr').textContent = label + ' in ' + n;
        }

        function step() {
            me.timer = setTimeout(function() {
                n--;
                if (n > 0) {
                    show();
                    step();
                    return;
                }
                cancelCountdown();
                go();
            }, 1000);
        }

        show();
        step();
        syncUI();
    }

    function snapWithCountdown() {
        if (counting && counting.kind === 'photo') return cancelCountdown();
        startCountdown('photo', 'Photo', takeSnapshot);
    }

    // ---------- Recording ----------
    // The picture on screen (the letters, not your face) is recorded as a video, signed like a photo.
    var recBadge = $('recBadge');
    var recTime = $('recTime');
    var recording = null; // { recorder, canvas, ctx, w, h, chunks, started, draw, clock } while a recording runs
    var MAX_RECORDING_MS = 120000;

    // Prefer MP4, which plays everywhere (including the iPhone's Photos); fall back to WebM
    function pickRecorderType() {
        if (!window.MediaRecorder || !MediaRecorder.isTypeSupported || !HTMLCanvasElement.prototype.captureStream) return '';
        var types = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
        for (var i = 0; i < types.length; i++) {
            if (MediaRecorder.isTypeSupported(types[i])) return types[i];
        }
        return '';
    }
    var recordType = pickRecorderType();
    var canRecord = !!recordType;

    function clockText(ms) {
        var total = Math.floor(ms / 1000);
        var sec = total % 60;
        return Math.floor(total / 60) + ':' + (sec < 10 ? '0' : '') + sec;
    }

    // Copy the current picture into the recording, fitted to its size, with the signature
    function drawRecordingFrame() {
        if (!recording) return;
        var source = $('view');
        var c = recording.ctx;
        var w = recording.w;
        var h = recording.h;
        var k = Math.min(w / source.width, h / source.height);
        var dw = source.width * k;
        var dh = source.height * k;
        c.fillStyle = theme.bg;
        c.fillRect(0, 0, w, h);
        c.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh);
        ascii.stamp(c, w, h, theme);
    }

    function updateRecordingClock() {
        if (!recording) return;
        var elapsed = Date.now() - recording.started;
        recTime.textContent = clockText(elapsed);
        if (elapsed >= MAX_RECORDING_MS) {
            toast('Stopped at ' + clockText(MAX_RECORDING_MS));
            stopRecording();
        }
    }

    function startRecording() {
        if (recording || !canRecord) return;
        var source = $('view');

        // Cap the size: a long edge of 1280 pixels (1920 on fast devices) keeps files small and the encoder keeping up.
        // Video wants even numbers.
        var longEdge = profile.tier === 'high' ? 1920 : 1280;
        var k = Math.min(1, longEdge / Math.max(source.width, source.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(2, Math.round(source.width * k / 2) * 2);
        canvas.height = Math.max(2, Math.round(source.height * k / 2) * 2);

        var recorder;
        try {
            recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: recordType, videoBitsPerSecond: 5000000 });
        } catch (e) {
            toast("Couldn't start recording");
            return;
        }

        var r = recording = {
            recorder: recorder,
            canvas: canvas,
            ctx: canvas.getContext('2d', { alpha: false }),
            w: canvas.width,
            h: canvas.height,
            chunks: [],
            started: Date.now(),
            draw: 0,
            clock: 0
        };
        recorder.ondataavailable = function(e) {
            if (e.data && e.data.size) r.chunks.push(e.data);
        };
        recorder.onstop = function() { finishRecording(r); };

        drawRecordingFrame();
        recorder.start(1000);
        // Redrawn on its own clock, so a paused picture still produces frames
        r.draw = setInterval(drawRecordingFrame, 1000 / 30);
        r.clock = setInterval(updateRecordingClock, 250);

        root.classList.add('recording');
        recBadge.hidden = false;
        updateRecordingClock();
        syncUI();
    }

    // The screen reacts at once; the file follows a moment later, when the recorder has flushed
    function stopRecording() {
        if (!recording) return;
        var r = recording;
        recording = null;
        clearInterval(r.draw);
        clearInterval(r.clock);
        root.classList.remove('recording');
        recBadge.hidden = true;
        syncUI();
        try {
            if (r.recorder.state !== 'inactive') r.recorder.stop();
            else finishRecording(r);
        } catch (e) {
            finishRecording(r);
        }
    }

    function finishRecording(r) {
        try {
            r.recorder.stream.getTracks().forEach(function(track) { track.stop(); });
        } catch (e) {}
        var blob = new Blob(r.chunks, { type: recordType.split(';')[0] });
        if (!blob.size) return toast('Nothing was recorded');
        saveBlob(blob, 'asciivision-' + fileStamp() + (recordType.indexOf('mp4') !== -1 ? '.mp4' : '.webm'));
    }

    function toggleRecord() {
        if (!canRecord) return;
        if (recording) return stopRecording();
        if (counting && counting.kind === 'video') return cancelCountdown();
        startCountdown('video', 'Recording', startRecording);
    }

    // ---------- Camera ----------

    function startCamera(facing) {
        return camera.start(facing).then(function() {
            state.cameraLive = true;
            state.resume = true;
            ascii.resetAuto();
            syncUI();
            return { ok: true };
        }, function(err) {
            syncUI();
            return { ok: false, reason: camera.explain(err) };
        });
    }

    function stopCamera() {
        camera.stop();
        state.cameraLive = false;
        state.resume = false;
        syncUI();
    }

    // Lines for the narrator when a button press fails to get a camera
    var failureLines = {
        denied: ['Camera access is blocked for this site.', 'Allow it in your browser settings, then press the camera button.'],
        missing: ['No camera found.', 'Showing a demo instead.'],
        busy: ['Another app is using the camera.', 'Showing a demo instead.'],
        insecure: ['Cameras only work on https pages.', 'Showing a demo instead.'],
        unsupported: ["This browser can't open a camera.", 'Showing a demo instead.'],
        unknown: ["The camera couldn't start.", 'Showing a demo instead.'],
        skipped: []
    };

    // Say several lines one after another
    function sayAll(lines) {
        return lines.reduce(function(chain, text) {
            return chain.then(function() { return narrator.say(text); });
        }, Promise.resolve());
    }

    function toggleCamera() {
        if (state.cameraLive) {
            stopCamera();
            toast('Camera off');
            return;
        }
        toast('Starting camera');
        startCamera().then(function(res) {
            if (res.ok) {
                scenes.setTitle(false);
                toast('Camera on');
            } else {
                // Already looking at the demo, so only the reason matters, except when there is something to fix
                var lines = failureLines[res.reason] || failureLines.unknown;
                if (res.reason !== 'denied') lines = lines.slice(0, 1);
                sayAll(lines).then(function() { return wait(1800); }).then(narrator.hide);
            }
        });
    }

    function flipCamera() {
        if (!state.cameraLive) return;
        toast('Switching camera');
        camera.flip().then(function() {
            ascii.resetAuto();
            syncUI();
        }, function() {
            toast("Couldn't switch camera");
        });
    }

    camera.onEnded = function() {
        state.cameraLive = false;
        syncUI();
        if (!document.hidden) toast('Camera disconnected');
    };

    // ---------- Showing and hiding the controls ----------
    var hudTimer = 0;

    function hudPinned() {
        if (state.paused) return true;
        if (chrome.matches(':hover')) return true;
        try { return !!chrome.querySelector(':focus-visible'); } catch (e) { return false; }
    }

    // The root class is what lets the viewfinder corners know the controls are away
    function showHud() {
        if (counting) return; // nothing should creep into the shot while 3, 2, 1 runs
        chrome.classList.remove('is-hidden');
        root.classList.remove('hud-hidden');
        document.body.classList.remove('idle');
        clearTimeout(hudTimer);
        hudTimer = setTimeout(maybeHideHud, 3800);
    }

    function maybeHideHud() {
        if (hudPinned()) {
            hudTimer = setTimeout(maybeHideHud, 1500);
            return;
        }
        hideHud();
    }

    function hideHud() {
        chrome.classList.add('is-hidden');
        root.classList.add('hud-hidden');
        if (!profile.touch) document.body.classList.add('idle');
    }

    // ---------- Input ----------
    var gesture = null;

    function movePointer(x, y, boost) {
        pointer.x = x;
        pointer.y = y;
        pointer.energy = Math.min(1, pointer.energy + boost);
    }

    if (window.PointerEvent) {
        stage.addEventListener('pointerdown', function(e) {
            pointer.down = true;
            movePointer(e.clientX, e.clientY, 0.5);
            gesture = { x: e.clientX, y: e.clientY, time: Date.now() };
        });
        stage.addEventListener('pointermove', function(e) {
            movePointer(e.clientX, e.clientY, 0.1);
            if (!profile.touch) showHud();
        });
        stage.addEventListener('pointerup', function(e) {
            pointer.down = false;
            if (!gesture) return;
            var dx = e.clientX - gesture.x;
            var dy = e.clientY - gesture.y;
            var quick = Date.now() - gesture.time < 700;
            gesture = null;
            // A quick horizontal swipe changes the theme
            if (quick && Math.abs(dx) > 70 && Math.abs(dy) < 60) cycleTheme(dx < 0 ? 1 : -1);
        });
        stage.addEventListener('pointercancel', function() {
            pointer.down = false;
            gesture = null;
        });
    } else {
        // Older browsers without pointer events
        stage.addEventListener('touchstart', function(e) { movePointer(e.touches[0].clientX, e.touches[0].clientY, 0.5); });
        stage.addEventListener('touchmove', function(e) { movePointer(e.touches[0].clientX, e.touches[0].clientY, 0.1); });
        stage.addEventListener('mousemove', function(e) { movePointer(e.clientX, e.clientY, 0.1); showHud(); });
    }

    // A tap shows the controls; tapping again hides them. (`click` works on every browser, old iPads included.)
    stage.addEventListener('click', function() {
        if (profile.touch && !chrome.classList.contains('is-hidden')) hideHud();
        else showHud();
    });

    // Block the iOS pinch-to-zoom gesture; this is a full-screen canvas, not a document
    document.addEventListener('gesturestart', function(e) { e.preventDefault(); });

    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey || e.metaKey || e.altKey || !e.key) return;
        var onButton = e.target && e.target.tagName === 'BUTTON';
        var key = e.key.toLowerCase();

        if (key === 'escape') {
            cancelCountdown();
            return;
        }

        if (key === ' ' || key === 'spacebar') {
            if (onButton) return; // let the focused button handle its own Space press
            e.preventDefault();
            togglePause();
        } else if (key === 'p') togglePause();
        else if (key === 'c') toggleCamera();
        else if (key === 't') cycleTheme(1);
        else if (key === 'g') cycleGlyphs();
        else if (key === 's') snapWithCountdown();
        else if (key === 'r') toggleRecord();
        else if (key === 'v' && narrator.available) toggleVoice();
        else if (key === 'f') toggleFullscreen();
        else if (key === 'l') flipCamera();
        else if (key === 'd') scenes.next();
        else if (key === 'h') {
            if (chrome.classList.contains('is-hidden')) showHud();
            else hideHud();
            return;
        } else return;
        showHud();
    });

    buttons.pause.addEventListener('click', togglePause);
    buttons.camera.addEventListener('click', toggleCamera);
    buttons.theme.addEventListener('click', function() { cycleTheme(1); });
    buttons.glyphs.addEventListener('click', cycleGlyphs);
    buttons.flip.addEventListener('click', flipCamera);
    buttons.snap.addEventListener('click', snapWithCountdown);
    buttons.rec.addEventListener('click', toggleRecord);
    recBadge.addEventListener('click', stopRecording);
    countEl.addEventListener('click', cancelCountdown);
    buttons.full.addEventListener('click', toggleFullscreen);

    // Any press on the controls keeps them on screen a little longer
    chrome.addEventListener('pointerdown', showHud);

    // ---------- Screen and page lifecycle ----------
    window.addEventListener('resize', function() { scheduleRelayout(150); });
    window.addEventListener('orientationchange', function() { scheduleRelayout(350); }); // iOS reports stale sizes at first
    if (window.visualViewport) window.visualViewport.addEventListener('resize', function() { scheduleRelayout(150); });
    document.addEventListener('fullscreenchange', function() { syncUI(); scheduleRelayout(200); });
    document.addEventListener('webkitfullscreenchange', function() { syncUI(); scheduleRelayout(200); });

    // iOS (and some Androids) take the camera away while the page is in the background; get it back
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            // Timers and drawing stall in the background, so end the countdown and keep what was recorded so far
            cancelCountdown();
            stopRecording();
            return;
        }
        last = 0;
        resetPerf();
        if (state.resume && !camera.alive()) startCamera();
    });
    // Let go of the camera when leaving the page, so the camera light goes out
    window.addEventListener('pagehide', function() { camera.stop(); });
    window.addEventListener('pageshow', function(e) {
        if (e.persisted && state.resume) startCamera();
    });

    // ---------- The self-running intro ----------
    // AsciiVision introduces itself, asks for the camera, and reacts to the answer.
    // Nobody has to click anything for any of this to happen.
    var introDone = false;

    function runIntro() {
        var returning = store.get('visited') === '1';
        store.set('visited', '1');

        if (params.get('intro') === 'off') {
            introDone = true;
            if (params.get('camera') !== 'off') startCamera();
            return Promise.resolve();
        }

        scenes.setTitle(true);

        // First visit: one plain line about what this is. Coming back: straight to the camera.
        var opening = returning ? Promise.resolve() : wait(700).then(function() {
            return narrator.say('AsciiVision turns light into letters.');
        });

        return opening.then(function() {
            if (params.get('camera') === 'off') return { ok: false, reason: 'skipped' };

            return camera.permission().then(function(permission) {
                // Only say anything if the browser is actually about to show its permission prompt
                if (permission !== 'granted' && permission !== 'denied' && camera.supported()) {
                    narrator.say('Allow camera access to begin.', { hold: 0 });
                }
                return startCamera();
            });
        }).then(function(res) {
            var lines;
            if (res.ok) {
                scenes.setTitle(false);
                lines = returning ? [] : [profile.touch ? 'Tap anywhere for controls.' : 'Move the mouse for controls.'];
            } else {
                setTimeout(function() { scenes.setTitle(false); }, 3500);
                lines = failureLines[res.reason] || failureLines.unknown;
            }
            return sayAll(lines);
        }).then(function() {
            return wait(returning ? 300 : 1800);
        }).then(function() {
            narrator.hide();
            introDone = true;
            showHud();
        }).catch(function(e) {
            if (window.console) console.error('[AsciiVision] intro failed:', e);
            scenes.setTitle(false);
            introDone = true;
        });
    }

    // ---------- Go ----------

    // A little something for anyone who opens the console
    if (window.console && console.log) {
        console.log('AsciiVision turns light into letters. https://github.com/QC20/AsciiVision  (options: ?debug ?theme=paper ?glyphs=blocks ?scene=donut)');
    }

    // Settings, in order of priority: the URL, then what the visitor chose last time, then "auto", which is the device's own preference
    var wantedTheme = params.get('theme') || store.get('themeMode') || 'auto';
    var wantedGlyphs = params.get('glyphs') || store.get('glyphs') || 'classic';
    // The voice is something you ask for: ?voice=on, the V key, or what you chose last time
    var wantedVoice = params.get('voice') === 'on' || (params.get('voice') !== 'off' && store.get('voice') === '1');

    narrator.setVoice(wantedVoice);
    relayout();
    setTheme(wantedTheme, false);
    setGlyphs(wantedGlyphs, false);
    if (params.get('scene')) scenes.jump(params.get('scene'));
    if (params.has('debug')) {
        debugEl.hidden = false;
        window.asciiVision = { state: state, perf: perf, profile: function() { return profile; }, grid: function() { return grid; } };
    }
    syncUI();

    requestAnimationFrame(frame);
    runIntro();
})();
