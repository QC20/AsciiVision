(function() {
    var asciiContainer = document.getElementById("ascii");
    var capturing = false;
    var invertCheckbox = document.getElementById("colorInvertCheckbox");

    // Function to handle color inversion checkbox change
    invertCheckbox.addEventListener("change", function() {
        if (this.checked) {
            document.body.classList.add("invert-colors");
        } else {
            document.body.classList.remove("invert-colors");
        }
    });

    camera.init({
        width: 220,
        height: 140,
        fps: 75,
        mirror: true,

        onFrame: function(canvas) {
            ascii.fromCanvas(canvas, {
                callback: function(asciiString) {
                    asciiContainer.innerHTML = asciiString;
                }
            });
        },

        onSuccess: function() {
            document.getElementById("info").style.display = "none";

            const button = document.getElementById("button");
            button.style.display = "block";
            button.onclick = function() {
                if (capturing) {
                    camera.pause();
                    button.innerText = 'resume';
                } else {
                    camera.start();
                    button.innerText = 'pause';
                }
                capturing = !capturing;
            };
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
