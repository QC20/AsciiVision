(function() {
    // Get the container element for displaying ASCII art
    var asciiContainer = document.getElementById("ascii");

    // Variable to track whether webcam feed is being captured
    var capturing = false;

    // Variable to store the current color scheme
    var colorScheme = 'white'; // Initial color scheme (white text on black background)

    // Get the button elements for inverting colors and toggling color schemes
    var invertButton = document.getElementById("invertButton");
    var colorToggleButton = document.getElementById("toggleColorCheckbox");

    // Get the button element for starting/pausing the webcam feed
    var startButton = document.getElementById("button");

    // Variable to track whether green inversion is applied
    var greenInverted = false; // Initially, not green inverted

    // Create a canvas element to combine webcam feed and grayscale feed
    var combinedCanvas = document.createElement("canvas");
    combinedCanvas.setAttribute('width', 440); // Double the width of the individual canvas
    combinedCanvas.setAttribute('height', 140); // Keep the height the same

    // Get the 2D rendering context of the combined canvas
    var combinedCtx = combinedCanvas.getContext('2d');

    // Initialize the webcam
    camera.init({
        width: 220,
        height: 140,
        fps: 75,
        mirror: true,

        // Callback function called on each frame
        onFrame: function(canvas) {
            // Convert webcam feed to black and white
            var grayscaleCanvas = convertToGrayscale(canvas);

            // Generate ASCII art from the grayscale feed
            ascii.fromCanvas(grayscaleCanvas, {
                callback: function(asciiString) {
                    // Display ASCII art based on the current color scheme
                    if (colorScheme === 'white') {
                        // White text on black background
                        asciiContainer.innerHTML = asciiString;
                        asciiContainer.style.color = '#000'; // Black text for white background
                        document.body.style.backgroundColor = '#fff'; // White background
                    } else if (colorScheme === 'black') {
                        // Black text on white background
                        asciiContainer.innerHTML = asciiString;
                        asciiContainer.style.color = '#fff'; // White text for black background
                        document.body.style.backgroundColor = '#000'; // Black background
                    } else if (colorScheme === 'green') {
                        // Bright green text on black background
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

        // Callback function called when webcam initialization succeeds
        onSuccess: function() {
            // Hide the information message
            document.getElementById("info").style.display = "none";

            // Show the start/pause button and set its initial text
            startButton.style.display = "block";
            startButton.innerText = capturing ? 'Pause' : 'Start';

            // Event listener for start/pause button
            startButton.onclick = function() {
                // Toggle between starting and pausing the webcam feed
                if (capturing) {
                    camera.pause();
                    startButton.innerText = 'Start';
                } else {
                    camera.start();
                    startButton.innerText = 'Pause';
                }
                capturing = !capturing;
            };

            // Show the invert color button
            invertButton.style.display = "block";

            // Event listener for invert color button
            invertButton.onclick = function() {
                // Toggle color scheme between black/white and white/black
                if (!document.body.classList.contains('invert-colors')) {
                    colorScheme = 'black'; // Change to black background and white text
                    colorToggleButton.checked = false; // Reset the toggle switch state
                } else {
                    colorScheme = 'white'; // Change back to white background and black text
                    greenInverted = false; // Reset the green inverted state
                    colorToggleButton.checked = false; // Reset the toggle switch state
                }
                document.body.classList.toggle('invert-colors'); // Toggle color inversion
            };

            // Event listener for color scheme toggle switch
            colorToggleButton.addEventListener('change', function() {
                if (document.body.classList.contains('invert-colors')) {
                    // Update color scheme based on toggle state
                    greenInverted = this.checked;
                    colorScheme = greenInverted ? 'green' : 'black'; // Change color scheme based on toggle state
                }
            });

            // Center the buttons
            var controls = document.querySelector('.controls');
            controls.style.display = 'flex';
            controls.style.justifyContent = 'center';
        },

        // Callback function called when webcam initialization fails
        onError: function(error) {
            // TODO: log error
        },

        // Callback function called when webcam is not supported
        onNotSupported: function() {
            // Hide the information message and ASCII container, show not supported message
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

        // Iterate through pixel data and calculate grayscale value
        for (var i = 0; i < data.length; i += 4) {
            var avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            data[i] = avg; // Red
            data[i + 1] = avg; // Green
            data[i + 2] = avg; // Blue
        }

        // Put the grayscale image data back onto the canvas
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }
})();
