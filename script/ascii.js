/*
  Jonas Kjeldmand Jensen
  May 2024
*/

// Immediately Invoked Function Expression (IIFE) to encapsulate the code
var ascii = (function() {

	// Function to convert an HTML canvas to ASCII art
	function asciiFromCanvas(canvas, options) {

		// Define a set of characters from darkest to lightest to represent pixel brightness
		var characters = (" .,:;i1tfLCG08@").split("");

		// Get canvas context and dimensions
		var context = canvas.getContext("2d");
		var canvasWidth = canvas.width;
		var canvasHeight = canvas.height;
		
		// Initialize an empty string to store the ASCII art
		var asciiCharacters = "";

		// Calculate contrast factor to adjust pixel brightness
		var contrastFactor = (259 * (options.contrast + 255)) / (255 * (259 - options.contrast));

		// Get image data from the canvas
		var imageData = context.getImageData(0, 0, canvasWidth, canvasHeight);

		// Loop through every other row of pixels
		for (var y = 0; y < canvasHeight; y += 2) {
			for (var x = 0; x < canvasWidth; x++) {
				// Get each pixel's color and calculate its brightness

				var offset = (y * canvasWidth + x) * 4;

				var color = getColorAtOffset(imageData.data, offset);

				// Adjust color contrast
				var contrastedColor = {
					red: bound(Math.floor((color.red - 128) * contrastFactor) + 128, [0, 255]),
					green: bound(Math.floor((color.green - 128) * contrastFactor) + 128, [0, 255]),
					blue: bound(Math.floor((color.blue - 128) * contrastFactor) + 128, [0, 255]),
					alpha: color.alpha
				};

				// Calculate brightness using weighted average of RGB values
				var brightness = (0.299 * contrastedColor.red + 0.587 * contrastedColor.green + 0.114 * contrastedColor.blue) / 255;

				// Map brightness to corresponding ASCII character
				var character = characters[(characters.length - 1) - Math.round(brightness * (characters.length - 1))];

				// Append character to ASCII art string
				asciiCharacters += character;
			}

			// Add newline after each row
			asciiCharacters += "\n";
		}

		// Execute callback function with the generated ASCII art
		options.callback(asciiCharacters);
	}

	// Helper function to extract color values from image data
	function getColorAtOffset(data, offset) {
		return {
			red: data[offset],
			green: data[offset + 1],
			blue: data[offset + 2],
			alpha: data[offset + 3]
		};
	}

	// Helper function to constrain a value within a given interval
	function bound(value, interval) {
		return Math.max(interval[0], Math.min(interval[1], value));
	}

	// Expose the conversion function as a method of the ascii object
	return {
		fromCanvas: function(canvas, options) {
			options = options || {};
			options.contrast = (typeof options.contrast === "undefined" ? 128 : options.contrast);
			options.callback = options.callback || doNothing;

			return asciiFromCanvas(canvas, options);
		}
	};
})();
