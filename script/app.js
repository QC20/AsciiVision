(function() {
    var asciiContainer = document.getElementById("ascii");
    var capturing = false;

    var startButton = document.getElementById("button");
    var invertButton = document.getElementById("invertButton");

    camera.init({
        width: 220,
        height: 140,
        fps: 75,
        mirror: true,

        onFrame: function(canvas) {
            ascii.fromCanvas(canvas, {
                // contrast: 128,
                callback: function(asciiString) {
                    asciiContainer.innerHTML = asciiString;
                }
            });
        },

        onSuccess: function() {
            document.getElementById("info").style.display = "none";

            startButton.style.display = "block";
            startButton.innerText = capturing ? 'pause' : 'start';
            startButton.onclick = function() {
                if (capturing) {
                    camera.pause();
                    startButton.innerText = 'start';
                } else {
                    camera.start();
                    startButton.innerText = 'pause';
                }
                capturing = !capturing;
            };

            invertButton.style.display = "block";
            invertButton.onclick = function() {
                document.body.classList.toggle('invert-colors');
            };

            // Center the buttons
            var controls = document.querySelector('.controls');
            controls.style.display = 'flex';
            controls.style.justifyContent = 'center';
        },

        onError: function(error) {
            // TODO: log error
        },

        onNotSupported: function() {
            document.getElementById("info").style.display = "none";
            asciiContainer.style.display = "none";
            document.getElementById("notSupported").style.display = "block";
        }
    });
})();
