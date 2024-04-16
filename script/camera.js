/*
	camera.js v1.1
	Author: Andrei Gheorghe
	License: MIT
*/

var camera = (function() {
	// Declare variables
	var options;
	var video, canvas, context;
	var renderTimer;

	// Function to initialize video stream from webcam
	function initVideoStream() {
		// Create video element with specified dimensions and attributes
		video = document.createElement("video");
		video.setAttribute('width', options.width);
		video.setAttribute('height', options.height);
		video.setAttribute('playsinline', 'true');
		video.setAttribute('webkit-playsinline', 'true');

		// Check for browser support for getUserMedia and URL
		navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
		window.URL = window.URL || window.webkitURL || window.mozURL || window.msURL;

		// Start video stream if getUserMedia is supported
		if (navigator.getUserMedia) {
			// Request video stream from webcam
			navigator.getUserMedia({
				video: true,
				audio: false,
			}, function(stream) {
				// Execute onSuccess callback if stream is successfully obtained
				options.onSuccess();

				// Set video source based on browser compatibility
				if (video.mozSrcObject !== undefined) { // hack for Firefox < 19
					video.mozSrcObject = stream;
				} else {
					video.srcObject = stream;
				}

				// Initialize canvas after obtaining video stream
				initCanvas();
			}, options.onError);
		} else {
			// Execute onNotSupported callback if getUserMedia is not supported
			options.onNotSupported();
		}
	}

	// Function to initialize canvas for rendering video frames
	function initCanvas() {
		// Create canvas element with specified dimensions
		canvas = options.targetCanvas || document.createElement("canvas");
		canvas.setAttribute('width', options.width);
		canvas.setAttribute('height', options.height);

		// Get 2D rendering context of the canvas
		context = canvas.getContext('2d');

		// Mirror video if specified in options
		if (options.mirror) {
			context.translate(canvas.width, 0);
			context.scale(-1, 1);
		}
	}

	// Function to start capturing video frames
	function startCapture() {
		video.play();

		// Set interval to continuously render video frames onto canvas
		renderTimer = setInterval(function() {
			try {
				context.drawImage(video, 0, 0, video.width, video.height);
				options.onFrame(canvas); // Execute onFrame callback with canvas as argument
			} catch (e) {
				// TODO: Handle errors
			}
		}, Math.round(1000 / options.fps));
	}

	// Function to stop capturing video frames
	function stopCapture() {
		pauseCapture();

		// Stop video stream and clear source object
		if (video.mozSrcObject !== undefined) {
			video.mozSrcObject = null;
		} else {
			video.srcObject = null;
		}
	}

	// Function to pause capturing video frames
	function pauseCapture() {
		// Clear rendering interval and pause video playback
		if (renderTimer) clearInterval(renderTimer);
		video.pause();
	}

	// Return public methods and properties
	return {
		// Method to initialize camera
		init: function(captureOptions) {
			// Define a do-nothing function
			var doNothing = function(){};

			// Assign provided options or defaults to options object
			options = captureOptions || {};

			options.fps = options.fps || 30;
			options.width = options.width || 640;
			options.height = options.height || 480;
			options.mirror = options.mirror || false;
			options.targetCanvas = options.targetCanvas || null; // TODO: is the element actually a <canvas> ?

			// Assign provided callbacks or do-nothing functions to options
			options.onSuccess = options.onSuccess || doNothing;
			options.onError = options.onError || doNothing;
			options.onNotSupported = options.onNotSupported || doNothing;
			options.onFrame = options.onFrame || doNothing;

			// Initialize video stream
			initVideoStream();
		},

		// Method to start capturing video frames
		start: startCapture,

		// Method to pause capturing video frames
		pause: pauseCapture,

		// Method to stop capturing video frames and release resources
		stop: stopCapture
	};
})();
