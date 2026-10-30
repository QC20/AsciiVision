/*
  scenes.js
  The generative animations AsciiVision shows before (or instead of) your camera.

  Every scene fills a field's brightness array with numbers from 0 to 1, one per
  letter cell. The renderer in ascii.js does the rest. Coordinates are normalised so
  that circles stay circles on any screen shape: 1.0 is the length of the short side.
*/
var scenes = (function() {
    var grid = null;
    var X, Y, R, A;        // x per column, y per row, and distance / angle from the centre per cell
    var title = null;      // the product name as a brightness mask
    var zbuf = null;       // depth buffer for the donut
    var spare = null;      // second buffer, used while one scene fades into the next
    var low = false;       // weaker devices get coarser maths

    var order = ['plasma', 'donut', 'lava'];
    var current = 0;
    var previous = 0;
    var age = 0;           // seconds the current scene has been on
    var fade = 1;          // 0..1 progress of the cross-fade into the current scene
    var clock = 0;         // scene time; runs slower when the user prefers reduced motion
    var speed = 1;
    var titleState = { target: 0, amount: 0 };

    var SCENE_SECONDS = 14;
    var FADE_SECONDS = 1.6;

    // Donut geometry is the same every frame, so look up the sines and cosines once
    var THETA_STEP = 0.07;
    var PHI_STEP = 0.028;
    var thetaN = Math.ceil(6.283 / THETA_STEP);
    var phiN = Math.ceil(6.283 / PHI_STEP);
    var ct = new Float32Array(thetaN);
    var st = new Float32Array(thetaN);
    var cp = new Float32Array(phiN);
    var sp = new Float32Array(phiN);
    for (var a = 0; a < thetaN; a++) {
        ct[a] = Math.cos(a * THETA_STEP);
        st[a] = Math.sin(a * THETA_STEP);
    }
    for (var b = 0; b < phiN; b++) {
        cp[b] = Math.cos(b * PHI_STEP);
        sp[b] = Math.sin(b * PHI_STEP);
    }

    // ---------- Setup ----------

    // Called whenever the grid changes size
    function resize(g, profile) {
        grid = g;
        low = profile.tier === 'low';
        speed = profile.reducedMotion ? 0.45 : 1;

        var S = Math.min(g.viewW, g.viewH);
        X = new Float32Array(g.cols);
        Y = new Float32Array(g.rows);
        R = new Float32Array(g.count);
        A = new Float32Array(g.count);
        var c, r, i = 0, x, y;
        for (c = 0; c < g.cols; c++) X[c] = ((c + 0.5) * g.cellW - g.viewW / 2) / S;
        for (r = 0; r < g.rows; r++) Y[r] = ((r + 0.5) * g.cellH - g.viewH / 2) / S;
        for (r = 0; r < g.rows; r++) {
            y = Y[r];
            for (c = 0; c < g.cols; c++, i++) {
                x = X[c];
                R[i] = Math.sqrt(x * x + y * y);
                A[i] = Math.atan2(y, x);
            }
        }

        zbuf = new Float32Array(g.count);
        spare = new Float32Array(g.count);

        title = buildTitle(g);
    }

    // Draw the name "AsciiVision" into a tiny canvas with one pixel per letter cell, and keep the result as a mask
    function buildTitle(g) {
        var canvas = document.createElement('canvas');
        canvas.width = g.cols;
        canvas.height = g.rows;
        var c = canvas.getContext('2d', { willReadFrequently: true });
        c.fillStyle = '#000';
        c.fillRect(0, 0, g.cols, g.rows);

        // Draw in screen pixels; this transform squeezes them down to cell pixels, so the lettering keeps its proportions
        c.setTransform(1 / g.cellW, 0, 0, 1 / g.cellH, 0, 0);
        c.fillStyle = '#fff';
        c.textAlign = 'center';
        c.textBaseline = 'middle';

        // Tall screens get the name on two lines so it can be bigger
        var portrait = g.viewH > g.viewW * 1.05;
        var words = portrait ? ['Ascii', 'Vision'] : ['AsciiVision'];
        var family = '"Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif';

        c.font = '900 100px ' + family;
        var widest = 0;
        words.forEach(function(w) { widest = Math.max(widest, c.measureText(w).width); });
        var size = Math.min(100 * (g.viewW * 0.82) / widest, g.viewH * (portrait ? 0.2 : 0.3));
        c.font = '900 ' + size + 'px ' + family;

        var top = g.viewH * 0.46 - (words.length - 1) * size * 0.5;
        words.forEach(function(w, k) { c.fillText(w, g.viewW / 2, top + k * size); });

        var data = c.getImageData(0, 0, g.cols, g.rows).data;
        var mask = new Float32Array(g.count);
        // Harden the soft edge of the lettering, so it reads as solid shapes instead of a fringe of random mid-tone characters
        for (var i = 0; i < g.count; i++) {
            var edge = (data[i * 4] / 255 - 0.3) / 0.4;
            edge = edge < 0 ? 0 : (edge > 1 ? 1 : edge);
            mask[i] = edge * edge * (3 - 2 * edge);
        }

        // A halo: the mask grown by a couple of cells. The waves are darkened inside it so the lettering stands out.
        // Cells are about twice as tall as wide, so it grows 2 across and 1 down.
        var wide = new Float32Array(g.count);
        var halo = new Float32Array(g.count);
        var x, y, k, best;
        for (y = 0; y < g.rows; y++) {
            for (x = 0; x < g.cols; x++) {
                best = 0;
                for (k = -2; k <= 2; k++) {
                    if (x + k >= 0 && x + k < g.cols && mask[y * g.cols + x + k] > best) best = mask[y * g.cols + x + k];
                }
                wide[y * g.cols + x] = best;
            }
        }
        for (y = 0; y < g.rows; y++) {
            for (x = 0; x < g.cols; x++) {
                best = 0;
                for (k = -1; k <= 1; k++) {
                    if (y + k >= 0 && y + k < g.rows && wide[(y + k) * g.cols + x] > best) best = wide[(y + k) * g.cols + x];
                }
                halo[y * g.cols + x] = best;
            }
        }
        return { mask: mask, halo: halo };
    }

    // ---------- Scenes ----------

    // Overlapping sine waves, with a spiral swirling through them. The title rises out of it at the start.
    function plasma(lum, t) {
        var cols = grid.cols;
        var rows = grid.rows;
        var t1 = t * 0.8;
        var t2 = t * 1.05;
        var t3 = t * 0.6;
        var t4 = t * 1.2;
        var t5 = t * 0.3;
        var showTitle = titleState.amount > 0.004;
        var amount = titleState.amount;
        var i = 0, x, y, v, m;

        for (var r = 0; r < rows; r++) {
            y = Y[r];
            for (var c = 0; c < cols; c++, i++) {
                x = X[c];
                v = Math.sin(x * 6 + t1) + Math.sin(y * 8 - t2) + Math.sin((x + y) * 5 + t3) +
                    Math.sin(R[i] * 10 - t4 + Math.sin(A[i] * 3 + t5) * 1.5);
                v = v * 0.125 + 0.5;
                v = v < 0 ? 0 : (v > 1 ? 1 : v);
                v = v * v * (3 - 2 * v);

                if (showTitle) {
                    // Dim the waves (a lot around the letters), then paint the letters at full strength
                    m = title.mask[i] * amount;
                    v = v * (1 - 0.45 * amount) * (1 - 0.85 * title.halo[i] * amount) * (1 - m) +
                        m * (0.955 + 0.045 * Math.sin(t * 3 + x * 9)); // stays in the densest characters, so the name reads as solid lettering
                }
                lum[i] = v;
            }
        }
    }

    // The famous spinning donut, drawn with real 3D maths: a ring of points rotated, lit, projected and depth-sorted
    function donut(lum, t) {
        var cols = grid.cols;
        var S = Math.min(grid.viewW, grid.viewH);
        var i;
        for (i = 0; i < grid.count; i++) {
            lum[i] = 0;
            zbuf[i] = 0;
        }

        var A1 = t * 0.9;
        var B1 = t * 0.55;
        var cA = Math.cos(A1), sA = Math.sin(A1);
        var cB = Math.cos(B1), sB = Math.sin(B1);
        var K2 = 5;
        var K1 = S * 0.62;            // how big the donut appears
        var halfW = grid.viewW / 2;
        var halfH = grid.viewH / 2;
        var step = low ? 2 : 1;

        for (var a = 0; a < thetaN; a++) {
            var circleX = 2 + ct[a];  // the tube is a circle of radius 1, centred 2 away from the donut's axis
            var circleY = st[a];
            for (var b = 0; b < phiN; b += step) {
                var cphi = cp[b], sphi = sp[b];
                var x = circleX * (cB * cphi + sA * sB * sphi) - circleY * cA * sB;
                var y = circleX * (sB * cphi - sA * cB * sphi) + circleY * cA * cB;
                var z = K2 + cA * circleX * sphi + circleY * sA;
                var ooz = 1 / z;

                var col = ((halfW + K1 * ooz * x) / grid.cellW) | 0;
                var row = ((halfH - K1 * ooz * y) / grid.cellH) | 0;
                if (col < 0 || col >= cols || row < 0 || row >= grid.rows) continue;

                // Surface brightness: the dot product of the surface normal with a light direction
                var L = cphi * ct[a] * sB - cA * ct[a] * sphi - sA * st[a] +
                    cB * (cA * st[a] - ct[a] * sA * sphi);
                var o = row * cols + col;
                if (L > 0 && ooz > zbuf[o]) {
                    zbuf[o] = ooz;
                    lum[o] = 0.1 + L * 0.63;
                }
            }
        }
    }

    // Lava lamp: soft blobs that merge when they come close
    function lava(lum, t) {
        var cols = grid.cols;
        var rows = grid.rows;
        var n = low ? 4 : 6;
        var bx = [], by = [], br = [];
        for (var k = 0; k < n; k++) {
            bx.push(0.5 * Math.sin(t * (0.31 + k * 0.07) + k * 2.1));
            by.push(0.34 * Math.cos(t * (0.27 + k * 0.05) + k * 1.3));
            br.push(0.09 + 0.045 * ((k * 5) % 3));
        }
        var i = 0, x, y, sum, dx, dy, v;
        for (var r = 0; r < rows; r++) {
            y = Y[r];
            for (var c = 0; c < cols; c++, i++) {
                x = X[c];
                sum = 0;
                for (k = 0; k < n; k++) {
                    dx = x - bx[k];
                    dy = y - by[k];
                    sum += br[k] * br[k] / (dx * dx + dy * dy + 0.0004);
                }
                v = (sum - 0.7) / 2.2;
                v = v < 0 ? 0 : (v > 1 ? 1 : v);
                lum[i] = v * v * (3 - 2 * v);
            }
        }
    }

    function draw(name, lum, t, dt) {
        if (name === 'plasma') plasma(lum, t);
        else if (name === 'donut') donut(lum, t);
        else lava(lum, t);
    }

    // A finger or mouse leaves a glowing trail in the scene
    function touch(lum, pointer) {
        if (pointer.energy < 0.02) return;
        var radius = Math.min(grid.viewW, grid.viewH) * 0.12;
        var r0 = Math.max(0, Math.floor((pointer.y - radius * 2) / grid.cellH));
        var r1 = Math.min(grid.rows - 1, Math.ceil((pointer.y + radius * 2) / grid.cellH));
        var c0 = Math.max(0, Math.floor((pointer.x - radius * 2) / grid.cellW));
        var c1 = Math.min(grid.cols - 1, Math.ceil((pointer.x + radius * 2) / grid.cellW));
        var inv = 1 / (radius * radius);
        var dx, dy, d2, v, o;
        for (var r = r0; r <= r1; r++) {
            dy = (r + 0.5) * grid.cellH - pointer.y;
            for (var c = c0; c <= c1; c++) {
                dx = (c + 0.5) * grid.cellW - pointer.x;
                d2 = (dx * dx + dy * dy) * inv;
                if (d2 < 4) {
                    v = Math.exp(-d2 * 1.6) * pointer.energy;
                    o = r * grid.cols + c;
                    lum[o] = 1 - (1 - lum[o]) * (1 - v);
                }
            }
        }
    }

    // ---------- Director ----------

    // Fill the field with the current frame of the show. The pointer is {x, y, energy}.
    function render(field, dt, pointer) {
        var lum = field.lum;
        dt = dt * speed;
        clock += dt;
        titleState.amount += (titleState.target - titleState.amount) * Math.min(1, dt * 1.8);

        // While the title is up, stay on the plasma it is made from
        if (titleState.target || titleState.amount > 0.01) {
            current = 0;
            age = 0;
        } else {
            age += dt;
            if (age > SCENE_SECONDS) next();
        }

        draw(order[current], lum, clock, dt);

        // Cross-fade out of the previous scene
        if (fade < 1) {
            fade = Math.min(1, fade + dt / FADE_SECONDS);
            if (fade < 1) {
                draw(order[previous], spare, clock, dt);
                var k = fade * fade * (3 - 2 * fade);
                for (var i = 0; i < grid.count; i++) lum[i] = spare[i] + (lum[i] - spare[i]) * k;
            }
        }

        touch(lum, pointer);
    }

    // Move on to the next scene (also bound to the D key)
    function next() {
        previous = current;
        current = (current + 1) % order.length;
        age = 0;
        fade = 0;
    }

    return {
        resize: resize,
        render: render,
        next: next,
        // Jump straight to a scene by name, e.g. ?scene=donut
        jump: function(name) {
            var index = order.indexOf(name);
            if (index >= 0) {
                current = previous = index;
                fade = 1;
                age = 0;
            }
        },
        // Show or hide the product name in the plasma
        setTitle: function(on) { titleState.target = on ? 1 : 0; }
    };
})();
