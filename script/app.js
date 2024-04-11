avaScript
/*
   ASCII Camera
   Released under the MIT license
 */

(function() {
  var asciiContainer = document.getElementById("ascii");
  var capturing = false;
  var invertCheckbox = document.getElementById("invertCheckbox"); // Reference the invert checkbox

  camera.init({
    width: 280,
    height: 200,
    fps: 75,
    mirror: true,

    onFrame: function(canvas) {
        ascii.fromCanvas(canvas, {
          // ... other options
          invert: invertCheckbox.checked, // Update invert option
          callback: function(asciiString) {
            asciiContainer.innerHTML = asciiString;
            console.log("Invert option:", invertCheckbox.checked); // Log invert option
          },
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
    },
  });
})();