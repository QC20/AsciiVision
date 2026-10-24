/*
  narrator.js
  AsciiVision's voice. Every line is typed out as a caption and, when the browser
  allows it, spoken aloud as well.

  Browsers refuse to make sound on a page nobody has touched yet (autoplay policy),
  and that includes speech. So the captions always work, and the voice switches on by
  itself the moment the visitor taps, clicks or presses a key anywhere on the page.
*/
var narrator = (function() {
    var box = document.getElementById('caption');
    var textEl = document.getElementById('captionText');
    var srEl = document.getElementById('sr');
    var hintEl = document.getElementById('voiceHint');
    var synth = window.speechSynthesis || null;
    var canSpeak = !!(synth && window.SpeechSynthesisUtterance);

    var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var wanted = true;      // does the visitor want a voice?
    var blocked = false;    // did the browser refuse to speak because nobody has interacted yet?
    var line = 0;           // number of the line on screen; lets an old typing loop notice it was replaced
    var current = '';       // text of the line on screen
    var voices = [];

    function wait(ms) {
        return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }

    // Voices load asynchronously in some browsers
    function loadVoices() {
        voices = synth.getVoices() || [];
    }
    if (canSpeak) {
        loadVoices();
        if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoices);
        else synth.onvoiceschanged = loadVoices;
    }

    // Prefer a pleasant English voice if the device has one. Otherwise the browser's default is used.
    function pickVoice() {
        var english = voices.filter(function(v) { return /^en([-_]|$)/i.test(v.lang); });
        var favourites = ['Samantha', 'Daniel', 'Google UK English', 'Google US English', 'Microsoft Aria', 'Microsoft Guy', 'Karen', 'Moira'];
        for (var f = 0; f < favourites.length; f++) {
            for (var v = 0; v < english.length; v++) {
                if (english[v].name.indexOf(favourites[f]) !== -1) return english[v];
            }
        }
        return null;
    }

    // The little "tap for voice" bubble shows while speech is wanted but blocked
    function updateHint() {
        hintEl.hidden = !(canSpeak && wanted && blocked);
    }

    // Speak one line. Resolves true when it finished, false when it could not or was cut off.
    function speak(text) {
        return new Promise(function(resolve) {
            if (!canSpeak || !wanted || blocked) return resolve(false);

            var finished = false;
            var timer;
            function done(ok) {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                resolve(ok);
            }

            try {
                synth.cancel();
                var u = new window.SpeechSynthesisUtterance(text);
                var voice = pickVoice();
                u.lang = voice ? voice.lang : 'en-US';
                if (voice) u.voice = voice;
                u.rate = 0.95;
                u.pitch = 0.9;
                u.onend = function() { done(true); };
                u.onerror = function(e) {
                    // 'not-allowed' is the autoplay policy talking: wait for the first user gesture
                    if (e && e.error === 'not-allowed') {
                        blocked = true;
                        updateHint();
                    }
                    done(false);
                };
                // Some mobile browsers never fire "end", so don't wait forever
                timer = setTimeout(function() { done(false); }, Math.max(2500, text.length * 110 + 1500));
                synth.speak(u);
            } catch (e) {
                done(false);
            }
        });
    }

    // Type the line into the caption, one letter at a time
    function type(text, id) {
        return new Promise(function(resolve) {
            if (reducedMotion) {
                textEl.textContent = text;
                return resolve();
            }
            var n = 0;
            textEl.textContent = '';
            (function tick() {
                if (id !== line) return resolve(); // a newer line has taken over
                n++;
                textEl.textContent = text.slice(0, n);
                if (n >= text.length) return resolve();
                var ch = text.charAt(n - 1);
                setTimeout(tick, /[.,?!]/.test(ch) ? 190 : 34);
            })();
        });
    }

    // Show a line, speak it, and resolve when it has been on screen long enough to read.
    // Resolves false if another line replaced it first.
    function say(text, options) {
        options = options || {};
        var id = ++line;
        current = text;
        box.classList.add('on');
        srEl.textContent = text;

        var typed = type(text, id);
        var spoken = options.silent ? Promise.resolve(false) : speak(text);
        return Promise.all([typed, spoken]).then(function(result) {
            var hold = result[1] ? 250 : 500 + text.length * 22;
            return wait(options.hold !== undefined ? options.hold : hold);
        }).then(function() {
            return id === line;
        });
    }

    // Fade the caption away
    function hide() {
        box.classList.remove('on');
    }

    function setVoice(on) {
        wanted = on;
        if (!on && canSpeak) synth.cancel();
        updateHint();
    }

    // Called from inside any user gesture. Starts the voice if it was held back, and says the line that is on screen.
    function unlock() {
        if (!canSpeak || !wanted || !blocked) return;
        blocked = false;
        updateHint();
        if (current && box.classList.contains('on')) speak(current);
    }

    // Lines spoken in response to a button press are always allowed, because the press itself is the gesture
    function confirm(text) {
        blocked = false;
        updateHint();
        return say(text, { hold: 900 });
    }

    // Any real gesture counts. Listening in the capture phase means nothing on the page can swallow it.
    ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown', 'click'].forEach(function(name) {
        document.addEventListener(name, unlock, true);
    });
    hintEl.addEventListener('click', function() { confirm('voice on.'); });

    updateHint();

    return {
        say: say,
        hide: hide,
        setVoice: setVoice,
        confirm: confirm,
        get available() { return canSpeak; },
        get voice() { return wanted; }
    };
})();
