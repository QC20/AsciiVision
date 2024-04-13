(function() {
    var asciiContainer = document.getElementById("ascii");
    var capturing = false;
    var colorScheme = 'white'; // Initial color scheme (white text on black background)
    var invertButton = document.getElementById("invertButton");
    var colorToggleButton = document.getElementById("toggleColorCheckbox");

    var startButton = document.getElementById("button");
    var greenInverted = false; // Initially, not green inverted

    var combinedCanvas = document.createElement("canvas");
    combinedCanvas.setAttribute('width', 440); // Double the width of the individual canvas
    combinedCanvas.setAttribute('height', 140); // Keep the height the same

    var combinedCtx = combinedCanvas.getContext('2d');

    camera.init({
        width: 220,
        height: 140,
        fps: 75,
        mirror: true,

        onFrame: function(canvas) {
            // Convert webcam feed to black and white
            var grayscaleCanvas = convertToGrayscale(canvas);
            

            ascii.fromCanvas(grayscaleCanvas, {
                callback: function(asciiString) {
                    if (colorScheme === 'white') {
                        asciiContainer.innerHTML = asciiString;
                        asciiContainer.style.color = '#000'; // Black text for white background
                        document.body.style.backgroundColor = '#fff'; // White background
                    } else if (colorScheme === 'black') {
                        asciiContainer.innerHTML = asciiString;
                        asciiContainer.style.color = '#fff'; // White text for black background
                        document.body.style.backgroundColor = '#000'; // Black background
                    } else if (colorScheme === 'green') {
                        asciiContainer.innerHTML = asciiString.replace(/ /g, '<span style="color:#0F0;"> </span>');
                        asciiContainer.style.color = '#0F0'; // Bright green text for black background
                        document.body.style.backgroundColor = '#000'; // Black background
                    }
                    // Update buttons with mirrored and grayscale webcam feed
                    startButton.style.backgroundImage = "url(" + grayscaleCanvas.toDataURL() + ")";
                    invertButton.style.backgroundImage = "url(" + grayscaleCanvas.toDataURL() + ")";
                }
            });
        },

        onSuccess: function() {
            document.getElementById("info").style.display = "none";

            startButton.style.display = "block";
            startButton.innerText = capturing ? 'Pause' : 'Start';
            startButton.onclick = function() {
                if (capturing) {
                    camera.pause();
                    startButton.innerText = 'Start';
                } else {
                    camera.start();
                    startButton.innerText = 'Pause';
                }
                capturing = !capturing;
            };

            invertButton.style.display = "block";
            invertButton.onclick = function() {
                if (!document.body.classList.contains('invert-colors')) {
                    colorScheme = 'black'; // Change to black background and white text
                    colorToggleButton.checked = false; // Reset the toggle switch state
                } else {
                    colorScheme = 'white'; // Change back to white background and black text
                    greenInverted = false; // Reset the green inverted state
                    colorToggleButton.checked = false; // Reset the toggle switch state
                }
                document.body.classList.toggle('invert-colors');
            };

            colorToggleButton.addEventListener('change', function() {
                if (document.body.classList.contains('invert-colors')) {
                    greenInverted = this.checked;
                    colorScheme = greenInverted ? 'green' : 'black'; // Change color scheme based on toggle state
                }
            });

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

    // Function to convert canvas to grayscale
    function convertToGrayscale(canvas) {
        var ctx = canvas.getContext('2d');
        var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var data = imageData.data;

        for (var i = 0; i < data.length; i += 4) {
            var avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            data[i] = avg; // Red
            data[i + 1] = avg; // Green
            data[i + 2] = avg; // Blue
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }
})();
