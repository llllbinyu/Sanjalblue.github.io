/******/ (() => { // webpackBootstrap
var __webpack_exports__ = {};
/*!************************************!*\
  !*** ./src/image-target/aframe.js ***!
  \************************************/
const {Controller, UI} = window.MINDAR.IMAGE;

AFRAME.registerSystem('mindar-image-system', {
  container: null,
  video: null,
  processingImage: false,

  init: function() {
    this.anchorEntities = [];
  },

  tick: function() {
  },

  setup: function({imageTargetSrc, maxTrack, showStats, uiLoading, uiScanning, uiError}) {
    this.imageTargetSrc = imageTargetSrc;
    this.maxTrack = maxTrack;
    this.showStats = showStats;
    this.ui = new UI({uiLoading, uiScanning, uiError});
  },

  registerAnchor: function(el, targetIndex) {
    this.anchorEntities.push({el: el, targetIndex: targetIndex});
  },

  start: function() {
    this.container = this.el.sceneEl.parentNode;

    if (this.showStats) {
      this.mainStats = new Stats();
      this.mainStats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
      this.mainStats.domElement.style.cssText = 'position:absolute;top:0px;left:0px;z-index:999';
      this.container.appendChild(this.mainStats.domElement);
    }

    this.ui.showLoading();
    this._startVideo();
  },

  switchTarget: function(targetIndex) {
    this.controller.interestedTargetIndex = targetIndex;
  },

  stop: function() {
    this.pause();
    const tracks = this.video.srcObject.getTracks();
    tracks.forEach(function(track) {
      track.stop();
    });
    this.video.remove();
  },

  pause: function(keepVideo=false) {
    if (!keepVideo) {
      this.video.pause();
    }
    this.controller.stopProcessVideo();
  },

  unpause: function() {
    this.video.play();
    this.controller.processVideo(this.video);
  },

  _startVideo: function() {
    this.video = document.createElement('video');

    this.video.setAttribute('autoplay', '');
    this.video.setAttribute('muted', '');
    this.video.setAttribute('playsinline', '');
    this.video.style.position = 'absolute'
    this.video.style.top = '0px'
    this.video.style.left = '0px'
    this.video.style.zIndex = '-2'
    this.container.appendChild(this.video);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      // TODO: show unsupported error
      this.el.emit("arError", {error: 'VIDEO_FAIL'});
      this.ui.showCompatibility();
      return;
    }

    navigator.mediaDevices.getUserMedia({audio: false, video: {
      facingMode: 'environment',
    }}).then((stream) => {
      this.video.addEventListener( 'loadedmetadata', () => {
        //console.log("video ready...", this.video);
        this.video.setAttribute('width', this.video.videoWidth);
        this.video.setAttribute('height', this.video.videoHeight);
        this._startAR();
      });
      this.video.srcObject = stream;
    }).catch((err) => {
      console.log("getUserMedia error", err);
      this.el.emit("arError", {error: 'VIDEO_FAIL'});
    });
  },

  _startAR: async function() {
    const video = this.video;
    const container = this.container;

    this.controller = new Controller({
      inputWidth: video.videoWidth,
      inputHeight: video.videoHeight,
      maxTrack: this.maxTrack, 
      onUpdate: (data) => {
	if (data.type === 'processDone') {
	  if (this.mainStats) this.mainStats.update();
	}
	else if (data.type === 'updateMatrix') {
	  const {targetIndex, worldMatrix} = data;

	  for (let i = 0; i < this.anchorEntities.length; i++) {
	    if (this.anchorEntities[i].targetIndex === targetIndex) {
	      this.anchorEntities[i].el.updateWorldMatrix(worldMatrix, );
	      if (worldMatrix) {
		this.ui.hideScanning();
	      }
	    }
	  }
	}
      }
    });

    this._resize();
    window.addEventListener('resize', this._resize.bind(this));

    const {dimensions: imageTargetDimensions} = await this.controller.addImageTargets(this.imageTargetSrc);

    for (let i = 0; i < this.anchorEntities.length; i++) {
      const {el, targetIndex} = this.anchorEntities[i];
      if (targetIndex < imageTargetDimensions.length) {
        el.setupMarker(imageTargetDimensions[targetIndex]);
      }
    }

    await this.controller.dummyRun(this.video);
    this.el.emit("arReady");
    this.ui.hideLoading();
    this.ui.showScanning();

    this.controller.processVideo(this.video);
  },

  _resize: function() {
    const video = this.video;
    const container = this.container;

    let vw, vh; // display css width, height
    const videoRatio = video.videoWidth / video.videoHeight;
    const containerRatio = container.clientWidth / container.clientHeight;
    if (videoRatio > containerRatio) {
      vh = container.clientHeight;
      vw = vh * videoRatio;
    } else {
      vw = container.clientWidth;
      vh = vw / videoRatio;
    }

    const proj = this.controller.getProjectionMatrix();
    const fov = 2 * Math.atan(1/proj[5] / vh * container.clientHeight ) * 180 / Math.PI; // vertical fov
    const near = proj[14] / (proj[10] - 1.0);
    const far = proj[14] / (proj[10] + 1.0);
    const ratio = proj[5] / proj[0]; // (r-l) / (t-b)
    //console.log("loaded proj: ", proj, ". fov: ", fov, ". near: ", near, ". far: ", far, ". ratio: ", ratio);
    const newAspect = container.clientWidth / container.clientHeight;
    const cameraEle = container.getElementsByTagName("a-camera")[0];
    const camera = cameraEle.getObject3D('camera');
    camera.fov = fov;
    camera.aspect = newAspect;
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
    //const newCam = new AFRAME.THREE.PerspectiveCamera(fov, newRatio, near, far);
    //camera.getObject3D('camera').projectionMatrix = newCam.projectionMatrix;

    this.video.style.top = (-(vh - container.clientHeight) / 2) + "px";
    this.video.style.left = (-(vw - container.clientWidth) / 2) + "px";
    this.video.style.width = vw + "px";
    this.video.style.height = vh + "px";
  }
});

AFRAME.registerComponent('mindar-image', {
  dependencies: ['mindar-image-system'],

  schema: {
    imageTargetSrc: {type: 'string'},
    maxTrack: {type: 'int', default: 1},
    showStats: {type: 'boolean', default: false},
    autoStart: {type: 'boolean', default: true},
    uiLoading: {type: 'string', default: 'yes'},
    uiScanning: {type: 'string', default: 'yes'},
    uiError: {type: 'string', default: 'yes'},
  },

  init: function() {
    const arSystem = this.el.sceneEl.systems['mindar-image-system'];

    arSystem.setup({
      imageTargetSrc: this.data.imageTargetSrc, 
      maxTrack: this.data.maxTrack,
      showStats: this.data.showStats,
      uiLoading: this.data.uiLoading,
      uiScanning: this.data.uiScanning,
      uiError: this.data.uiError,
    });
    if (this.data.autoStart) {
      this.el.sceneEl.addEventListener('renderstart', () => {
        arSystem.start();
      });
    }
  }
});

AFRAME.registerComponent('mindar-image-target', {
  dependencies: ['mindar-image-system'],

  schema: {
    targetIndex: {type: 'number'},
  },

  postMatrix: null, // rescale the anchor to make width of 1 unit = physical width of card

  init: function() {
    const arSystem = this.el.sceneEl.systems['mindar-image-system'];
    arSystem.registerAnchor(this, this.data.targetIndex);

    const root = this.el.object3D;
    root.visible = false;
    root.matrixAutoUpdate = false;
  },

  setupMarker([markerWidth, markerHeight]) {
    const position = new AFRAME.THREE.Vector3();
    const quaternion = new AFRAME.THREE.Quaternion();
    const scale = new AFRAME.THREE.Vector3();
    position.x = markerWidth / 2;
    position.y = markerWidth / 2 + (markerHeight - markerWidth) / 2;
    scale.x = markerWidth;
    scale.y = markerWidth;
    scale.z = markerWidth;
    this.postMatrix = new AFRAME.THREE.Matrix4();
    this.postMatrix.compose(position, quaternion, scale);
  },

  updateWorldMatrix(worldMatrix) {
    if (!this.el.object3D.visible && worldMatrix !== null) {
      this.el.emit("targetFound");
    } else if (this.el.object3D.visible && worldMatrix === null) {
      this.el.emit("targetLost");
    }

    this.el.object3D.visible = worldMatrix !== null;
    if (worldMatrix === null) {
      return;
    }
    var m = new AFRAME.THREE.Matrix4();
    m.elements = worldMatrix;
    m.multiply(this.postMatrix);
    this.el.object3D.matrix = m;
  }
});

/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9taW5kLWFyLy4vc3JjL2ltYWdlLXRhcmdldC9hZnJhbWUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxPQUFPLGVBQWU7O0FBRXRCO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQSxHQUFHOztBQUVIO0FBQ0EsR0FBRzs7QUFFSCxtQkFBbUIsb0VBQW9FO0FBQ3ZGO0FBQ0E7QUFDQTtBQUNBLHNCQUFzQiwrQkFBK0I7QUFDckQsR0FBRzs7QUFFSDtBQUNBLDhCQUE4QixpQ0FBaUM7QUFDL0QsR0FBRzs7QUFFSDtBQUNBOztBQUVBO0FBQ0E7QUFDQSxvQ0FBb0M7QUFDcEMsbUVBQW1FLFFBQVEsU0FBUztBQUNwRjtBQUNBOztBQUVBO0FBQ0E7QUFDQSxHQUFHOztBQUVIO0FBQ0E7QUFDQSxHQUFHOztBQUVIO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQSxHQUFHOztBQUVIO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxHQUFHOztBQUVIO0FBQ0E7QUFDQTtBQUNBLEdBQUc7O0FBRUg7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQSwrQkFBK0Isb0JBQW9CO0FBQ25EO0FBQ0E7QUFDQTs7QUFFQSx5Q0FBeUM7QUFDekM7QUFDQSxNQUFNO0FBQ047QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE9BQU87QUFDUDtBQUNBLEtBQUs7QUFDTDtBQUNBLCtCQUErQixvQkFBb0I7QUFDbkQsS0FBSztBQUNMLEdBQUc7O0FBRUg7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFVBQVUseUJBQXlCOztBQUVuQyxrQkFBa0IsZ0NBQWdDO0FBQ2xEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7O0FBRUw7QUFDQTs7QUFFQSxXQUFXLGtDQUFrQzs7QUFFN0MsbUJBQW1CLGdDQUFnQztBQUNuRCxhQUFhLGdCQUFnQjtBQUM3QjtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLEdBQUc7O0FBRUg7QUFDQTtBQUNBOztBQUVBLGVBQWU7QUFDZjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLHdGQUF3RjtBQUN4RjtBQUNBO0FBQ0Esb0NBQW9DO0FBQ3BDO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLENBQUM7O0FBRUQ7QUFDQTs7QUFFQTtBQUNBLHFCQUFxQixlQUFlO0FBQ3BDLGVBQWUsd0JBQXdCO0FBQ3ZDLGdCQUFnQixnQ0FBZ0M7QUFDaEQsZ0JBQWdCLCtCQUErQjtBQUMvQyxnQkFBZ0IsK0JBQStCO0FBQy9DLGlCQUFpQiwrQkFBK0I7QUFDaEQsY0FBYywrQkFBK0I7QUFDN0MsR0FBRzs7QUFFSDtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQTtBQUNBLE9BQU87QUFDUDtBQUNBO0FBQ0EsQ0FBQzs7QUFFRDtBQUNBOztBQUVBO0FBQ0Esa0JBQWtCLGVBQWU7QUFDakMsR0FBRzs7QUFFSDs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0EsR0FBRzs7QUFFSDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsR0FBRzs7QUFFSDtBQUNBO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxDQUFDIiwiZmlsZSI6Im1pbmRhci1pbWFnZS1hZnJhbWUuanMiLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCB7Q29udHJvbGxlciwgVUl9ID0gd2luZG93Lk1JTkRBUi5JTUFHRTtcblxuQUZSQU1FLnJlZ2lzdGVyU3lzdGVtKCdtaW5kYXItaW1hZ2Utc3lzdGVtJywge1xuICBjb250YWluZXI6IG51bGwsXG4gIHZpZGVvOiBudWxsLFxuICBwcm9jZXNzaW5nSW1hZ2U6IGZhbHNlLFxuXG4gIGluaXQ6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuYW5jaG9yRW50aXRpZXMgPSBbXTtcbiAgfSxcblxuICB0aWNrOiBmdW5jdGlvbigpIHtcbiAgfSxcblxuICBzZXR1cDogZnVuY3Rpb24oe2ltYWdlVGFyZ2V0U3JjLCBtYXhUcmFjaywgc2hvd1N0YXRzLCB1aUxvYWRpbmcsIHVpU2Nhbm5pbmcsIHVpRXJyb3J9KSB7XG4gICAgdGhpcy5pbWFnZVRhcmdldFNyYyA9IGltYWdlVGFyZ2V0U3JjO1xuICAgIHRoaXMubWF4VHJhY2sgPSBtYXhUcmFjaztcbiAgICB0aGlzLnNob3dTdGF0cyA9IHNob3dTdGF0cztcbiAgICB0aGlzLnVpID0gbmV3IFVJKHt1aUxvYWRpbmcsIHVpU2Nhbm5pbmcsIHVpRXJyb3J9KTtcbiAgfSxcblxuICByZWdpc3RlckFuY2hvcjogZnVuY3Rpb24oZWwsIHRhcmdldEluZGV4KSB7XG4gICAgdGhpcy5hbmNob3JFbnRpdGllcy5wdXNoKHtlbDogZWwsIHRhcmdldEluZGV4OiB0YXJnZXRJbmRleH0pO1xuICB9LFxuXG4gIHN0YXJ0OiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmNvbnRhaW5lciA9IHRoaXMuZWwuc2NlbmVFbC5wYXJlbnROb2RlO1xuXG4gICAgaWYgKHRoaXMuc2hvd1N0YXRzKSB7XG4gICAgICB0aGlzLm1haW5TdGF0cyA9IG5ldyBTdGF0cygpO1xuICAgICAgdGhpcy5tYWluU3RhdHMuc2hvd1BhbmVsKCAwICk7IC8vIDA6IGZwcywgMTogbXMsIDI6IG1iLCAzKzogY3VzdG9tXG4gICAgICB0aGlzLm1haW5TdGF0cy5kb21FbGVtZW50LnN0eWxlLmNzc1RleHQgPSAncG9zaXRpb246YWJzb2x1dGU7dG9wOjBweDtsZWZ0OjBweDt6LWluZGV4Ojk5OSc7XG4gICAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLm1haW5TdGF0cy5kb21FbGVtZW50KTtcbiAgICB9XG5cbiAgICB0aGlzLnVpLnNob3dMb2FkaW5nKCk7XG4gICAgdGhpcy5fc3RhcnRWaWRlbygpO1xuICB9LFxuXG4gIHN3aXRjaFRhcmdldDogZnVuY3Rpb24odGFyZ2V0SW5kZXgpIHtcbiAgICB0aGlzLmNvbnRyb2xsZXIuaW50ZXJlc3RlZFRhcmdldEluZGV4ID0gdGFyZ2V0SW5kZXg7XG4gIH0sXG5cbiAgc3RvcDogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5wYXVzZSgpO1xuICAgIGNvbnN0IHRyYWNrcyA9IHRoaXMudmlkZW8uc3JjT2JqZWN0LmdldFRyYWNrcygpO1xuICAgIHRyYWNrcy5mb3JFYWNoKGZ1bmN0aW9uKHRyYWNrKSB7XG4gICAgICB0cmFjay5zdG9wKCk7XG4gICAgfSk7XG4gICAgdGhpcy52aWRlby5yZW1vdmUoKTtcbiAgfSxcblxuICBwYXVzZTogZnVuY3Rpb24oa2VlcFZpZGVvPWZhbHNlKSB7XG4gICAgaWYgKCFrZWVwVmlkZW8pIHtcbiAgICAgIHRoaXMudmlkZW8ucGF1c2UoKTtcbiAgICB9XG4gICAgdGhpcy5jb250cm9sbGVyLnN0b3BQcm9jZXNzVmlkZW8oKTtcbiAgfSxcblxuICB1bnBhdXNlOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnZpZGVvLnBsYXkoKTtcbiAgICB0aGlzLmNvbnRyb2xsZXIucHJvY2Vzc1ZpZGVvKHRoaXMudmlkZW8pO1xuICB9LFxuXG4gIF9zdGFydFZpZGVvOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnZpZGVvID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndmlkZW8nKTtcblxuICAgIHRoaXMudmlkZW8uc2V0QXR0cmlidXRlKCdhdXRvcGxheScsICcnKTtcbiAgICB0aGlzLnZpZGVvLnNldEF0dHJpYnV0ZSgnbXV0ZWQnLCAnJyk7XG4gICAgdGhpcy52aWRlby5zZXRBdHRyaWJ1dGUoJ3BsYXlzaW5saW5lJywgJycpO1xuICAgIHRoaXMudmlkZW8uc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnXG4gICAgdGhpcy52aWRlby5zdHlsZS50b3AgPSAnMHB4J1xuICAgIHRoaXMudmlkZW8uc3R5bGUubGVmdCA9ICcwcHgnXG4gICAgdGhpcy52aWRlby5zdHlsZS56SW5kZXggPSAnLTInXG4gICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy52aWRlbyk7XG5cbiAgICBpZiAoIW5hdmlnYXRvci5tZWRpYURldmljZXMgfHwgIW5hdmlnYXRvci5tZWRpYURldmljZXMuZ2V0VXNlck1lZGlhKSB7XG4gICAgICAvLyBUT0RPOiBzaG93IHVuc3VwcG9ydGVkIGVycm9yXG4gICAgICB0aGlzLmVsLmVtaXQoXCJhckVycm9yXCIsIHtlcnJvcjogJ1ZJREVPX0ZBSUwnfSk7XG4gICAgICB0aGlzLnVpLnNob3dDb21wYXRpYmlsaXR5KCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbmF2aWdhdG9yLm1lZGlhRGV2aWNlcy5nZXRVc2VyTWVkaWEoe2F1ZGlvOiBmYWxzZSwgdmlkZW86IHtcbiAgICAgIGZhY2luZ01vZGU6ICdlbnZpcm9ubWVudCcsXG4gICAgfX0pLnRoZW4oKHN0cmVhbSkgPT4ge1xuICAgICAgdGhpcy52aWRlby5hZGRFdmVudExpc3RlbmVyKCAnbG9hZGVkbWV0YWRhdGEnLCAoKSA9PiB7XG4gICAgICAgIC8vY29uc29sZS5sb2coXCJ2aWRlbyByZWFkeS4uLlwiLCB0aGlzLnZpZGVvKTtcbiAgICAgICAgdGhpcy52aWRlby5zZXRBdHRyaWJ1dGUoJ3dpZHRoJywgdGhpcy52aWRlby52aWRlb1dpZHRoKTtcbiAgICAgICAgdGhpcy52aWRlby5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsIHRoaXMudmlkZW8udmlkZW9IZWlnaHQpO1xuICAgICAgICB0aGlzLl9zdGFydEFSKCk7XG4gICAgICB9KTtcbiAgICAgIHRoaXMudmlkZW8uc3JjT2JqZWN0ID0gc3RyZWFtO1xuICAgIH0pLmNhdGNoKChlcnIpID0+IHtcbiAgICAgIGNvbnNvbGUubG9nKFwiZ2V0VXNlck1lZGlhIGVycm9yXCIsIGVycik7XG4gICAgICB0aGlzLmVsLmVtaXQoXCJhckVycm9yXCIsIHtlcnJvcjogJ1ZJREVPX0ZBSUwnfSk7XG4gICAgfSk7XG4gIH0sXG5cbiAgX3N0YXJ0QVI6IGFzeW5jIGZ1bmN0aW9uKCkge1xuICAgIGNvbnN0IHZpZGVvID0gdGhpcy52aWRlbztcbiAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLmNvbnRhaW5lcjtcblxuICAgIHRoaXMuY29udHJvbGxlciA9IG5ldyBDb250cm9sbGVyKHtcbiAgICAgIGlucHV0V2lkdGg6IHZpZGVvLnZpZGVvV2lkdGgsXG4gICAgICBpbnB1dEhlaWdodDogdmlkZW8udmlkZW9IZWlnaHQsXG4gICAgICBtYXhUcmFjazogdGhpcy5tYXhUcmFjaywgXG4gICAgICBvblVwZGF0ZTogKGRhdGEpID0+IHtcblx0aWYgKGRhdGEudHlwZSA9PT0gJ3Byb2Nlc3NEb25lJykge1xuXHQgIGlmICh0aGlzLm1haW5TdGF0cykgdGhpcy5tYWluU3RhdHMudXBkYXRlKCk7XG5cdH1cblx0ZWxzZSBpZiAoZGF0YS50eXBlID09PSAndXBkYXRlTWF0cml4Jykge1xuXHQgIGNvbnN0IHt0YXJnZXRJbmRleCwgd29ybGRNYXRyaXh9ID0gZGF0YTtcblxuXHQgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5hbmNob3JFbnRpdGllcy5sZW5ndGg7IGkrKykge1xuXHQgICAgaWYgKHRoaXMuYW5jaG9yRW50aXRpZXNbaV0udGFyZ2V0SW5kZXggPT09IHRhcmdldEluZGV4KSB7XG5cdCAgICAgIHRoaXMuYW5jaG9yRW50aXRpZXNbaV0uZWwudXBkYXRlV29ybGRNYXRyaXgod29ybGRNYXRyaXgsICk7XG5cdCAgICAgIGlmICh3b3JsZE1hdHJpeCkge1xuXHRcdHRoaXMudWkuaGlkZVNjYW5uaW5nKCk7XG5cdCAgICAgIH1cblx0ICAgIH1cblx0ICB9XG5cdH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMuX3Jlc2l6ZSgpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdyZXNpemUnLCB0aGlzLl9yZXNpemUuYmluZCh0aGlzKSk7XG5cbiAgICBjb25zdCB7ZGltZW5zaW9uczogaW1hZ2VUYXJnZXREaW1lbnNpb25zfSA9IGF3YWl0IHRoaXMuY29udHJvbGxlci5hZGRJbWFnZVRhcmdldHModGhpcy5pbWFnZVRhcmdldFNyYyk7XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuYW5jaG9yRW50aXRpZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHtlbCwgdGFyZ2V0SW5kZXh9ID0gdGhpcy5hbmNob3JFbnRpdGllc1tpXTtcbiAgICAgIGlmICh0YXJnZXRJbmRleCA8IGltYWdlVGFyZ2V0RGltZW5zaW9ucy5sZW5ndGgpIHtcbiAgICAgICAgZWwuc2V0dXBNYXJrZXIoaW1hZ2VUYXJnZXREaW1lbnNpb25zW3RhcmdldEluZGV4XSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgYXdhaXQgdGhpcy5jb250cm9sbGVyLmR1bW15UnVuKHRoaXMudmlkZW8pO1xuICAgIHRoaXMuZWwuZW1pdChcImFyUmVhZHlcIik7XG4gICAgdGhpcy51aS5oaWRlTG9hZGluZygpO1xuICAgIHRoaXMudWkuc2hvd1NjYW5uaW5nKCk7XG5cbiAgICB0aGlzLmNvbnRyb2xsZXIucHJvY2Vzc1ZpZGVvKHRoaXMudmlkZW8pO1xuICB9LFxuXG4gIF9yZXNpemU6IGZ1bmN0aW9uKCkge1xuICAgIGNvbnN0IHZpZGVvID0gdGhpcy52aWRlbztcbiAgICBjb25zdCBjb250YWluZXIgPSB0aGlzLmNvbnRhaW5lcjtcblxuICAgIGxldCB2dywgdmg7IC8vIGRpc3BsYXkgY3NzIHdpZHRoLCBoZWlnaHRcbiAgICBjb25zdCB2aWRlb1JhdGlvID0gdmlkZW8udmlkZW9XaWR0aCAvIHZpZGVvLnZpZGVvSGVpZ2h0O1xuICAgIGNvbnN0IGNvbnRhaW5lclJhdGlvID0gY29udGFpbmVyLmNsaWVudFdpZHRoIC8gY29udGFpbmVyLmNsaWVudEhlaWdodDtcbiAgICBpZiAodmlkZW9SYXRpbyA+IGNvbnRhaW5lclJhdGlvKSB7XG4gICAgICB2aCA9IGNvbnRhaW5lci5jbGllbnRIZWlnaHQ7XG4gICAgICB2dyA9IHZoICogdmlkZW9SYXRpbztcbiAgICB9IGVsc2Uge1xuICAgICAgdncgPSBjb250YWluZXIuY2xpZW50V2lkdGg7XG4gICAgICB2aCA9IHZ3IC8gdmlkZW9SYXRpbztcbiAgICB9XG5cbiAgICBjb25zdCBwcm9qID0gdGhpcy5jb250cm9sbGVyLmdldFByb2plY3Rpb25NYXRyaXgoKTtcbiAgICBjb25zdCBmb3YgPSAyICogTWF0aC5hdGFuKDEvcHJvals1XSAvIHZoICogY29udGFpbmVyLmNsaWVudEhlaWdodCApICogMTgwIC8gTWF0aC5QSTsgLy8gdmVydGljYWwgZm92XG4gICAgY29uc3QgbmVhciA9IHByb2pbMTRdIC8gKHByb2pbMTBdIC0gMS4wKTtcbiAgICBjb25zdCBmYXIgPSBwcm9qWzE0XSAvIChwcm9qWzEwXSArIDEuMCk7XG4gICAgY29uc3QgcmF0aW8gPSBwcm9qWzVdIC8gcHJvalswXTsgLy8gKHItbCkgLyAodC1iKVxuICAgIC8vY29uc29sZS5sb2coXCJsb2FkZWQgcHJvajogXCIsIHByb2osIFwiLiBmb3Y6IFwiLCBmb3YsIFwiLiBuZWFyOiBcIiwgbmVhciwgXCIuIGZhcjogXCIsIGZhciwgXCIuIHJhdGlvOiBcIiwgcmF0aW8pO1xuICAgIGNvbnN0IG5ld0FzcGVjdCA9IGNvbnRhaW5lci5jbGllbnRXaWR0aCAvIGNvbnRhaW5lci5jbGllbnRIZWlnaHQ7XG4gICAgY29uc3QgY2FtZXJhRWxlID0gY29udGFpbmVyLmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiYS1jYW1lcmFcIilbMF07XG4gICAgY29uc3QgY2FtZXJhID0gY2FtZXJhRWxlLmdldE9iamVjdDNEKCdjYW1lcmEnKTtcbiAgICBjYW1lcmEuZm92ID0gZm92O1xuICAgIGNhbWVyYS5hc3BlY3QgPSBuZXdBc3BlY3Q7XG4gICAgY2FtZXJhLm5lYXIgPSBuZWFyO1xuICAgIGNhbWVyYS5mYXIgPSBmYXI7XG4gICAgY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcbiAgICAvL2NvbnN0IG5ld0NhbSA9IG5ldyBBRlJBTUUuVEhSRUUuUGVyc3BlY3RpdmVDYW1lcmEoZm92LCBuZXdSYXRpbywgbmVhciwgZmFyKTtcbiAgICAvL2NhbWVyYS5nZXRPYmplY3QzRCgnY2FtZXJhJykucHJvamVjdGlvbk1hdHJpeCA9IG5ld0NhbS5wcm9qZWN0aW9uTWF0cml4O1xuXG4gICAgdGhpcy52aWRlby5zdHlsZS50b3AgPSAoLSh2aCAtIGNvbnRhaW5lci5jbGllbnRIZWlnaHQpIC8gMikgKyBcInB4XCI7XG4gICAgdGhpcy52aWRlby5zdHlsZS5sZWZ0ID0gKC0odncgLSBjb250YWluZXIuY2xpZW50V2lkdGgpIC8gMikgKyBcInB4XCI7XG4gICAgdGhpcy52aWRlby5zdHlsZS53aWR0aCA9IHZ3ICsgXCJweFwiO1xuICAgIHRoaXMudmlkZW8uc3R5bGUuaGVpZ2h0ID0gdmggKyBcInB4XCI7XG4gIH1cbn0pO1xuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoJ21pbmRhci1pbWFnZScsIHtcbiAgZGVwZW5kZW5jaWVzOiBbJ21pbmRhci1pbWFnZS1zeXN0ZW0nXSxcblxuICBzY2hlbWE6IHtcbiAgICBpbWFnZVRhcmdldFNyYzoge3R5cGU6ICdzdHJpbmcnfSxcbiAgICBtYXhUcmFjazoge3R5cGU6ICdpbnQnLCBkZWZhdWx0OiAxfSxcbiAgICBzaG93U3RhdHM6IHt0eXBlOiAnYm9vbGVhbicsIGRlZmF1bHQ6IGZhbHNlfSxcbiAgICBhdXRvU3RhcnQ6IHt0eXBlOiAnYm9vbGVhbicsIGRlZmF1bHQ6IHRydWV9LFxuICAgIHVpTG9hZGluZzoge3R5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiAneWVzJ30sXG4gICAgdWlTY2FubmluZzoge3R5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiAneWVzJ30sXG4gICAgdWlFcnJvcjoge3R5cGU6ICdzdHJpbmcnLCBkZWZhdWx0OiAneWVzJ30sXG4gIH0sXG5cbiAgaW5pdDogZnVuY3Rpb24oKSB7XG4gICAgY29uc3QgYXJTeXN0ZW0gPSB0aGlzLmVsLnNjZW5lRWwuc3lzdGVtc1snbWluZGFyLWltYWdlLXN5c3RlbSddO1xuXG4gICAgYXJTeXN0ZW0uc2V0dXAoe1xuICAgICAgaW1hZ2VUYXJnZXRTcmM6IHRoaXMuZGF0YS5pbWFnZVRhcmdldFNyYywgXG4gICAgICBtYXhUcmFjazogdGhpcy5kYXRhLm1heFRyYWNrLFxuICAgICAgc2hvd1N0YXRzOiB0aGlzLmRhdGEuc2hvd1N0YXRzLFxuICAgICAgdWlMb2FkaW5nOiB0aGlzLmRhdGEudWlMb2FkaW5nLFxuICAgICAgdWlTY2FubmluZzogdGhpcy5kYXRhLnVpU2Nhbm5pbmcsXG4gICAgICB1aUVycm9yOiB0aGlzLmRhdGEudWlFcnJvcixcbiAgICB9KTtcbiAgICBpZiAodGhpcy5kYXRhLmF1dG9TdGFydCkge1xuICAgICAgdGhpcy5lbC5zY2VuZUVsLmFkZEV2ZW50TGlzdGVuZXIoJ3JlbmRlcnN0YXJ0JywgKCkgPT4ge1xuICAgICAgICBhclN5c3RlbS5zdGFydCgpO1xuICAgICAgfSk7XG4gICAgfVxuICB9XG59KTtcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KCdtaW5kYXItaW1hZ2UtdGFyZ2V0Jywge1xuICBkZXBlbmRlbmNpZXM6IFsnbWluZGFyLWltYWdlLXN5c3RlbSddLFxuXG4gIHNjaGVtYToge1xuICAgIHRhcmdldEluZGV4OiB7dHlwZTogJ251bWJlcid9LFxuICB9LFxuXG4gIHBvc3RNYXRyaXg6IG51bGwsIC8vIHJlc2NhbGUgdGhlIGFuY2hvciB0byBtYWtlIHdpZHRoIG9mIDEgdW5pdCA9IHBoeXNpY2FsIHdpZHRoIG9mIGNhcmRcblxuICBpbml0OiBmdW5jdGlvbigpIHtcbiAgICBjb25zdCBhclN5c3RlbSA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zWydtaW5kYXItaW1hZ2Utc3lzdGVtJ107XG4gICAgYXJTeXN0ZW0ucmVnaXN0ZXJBbmNob3IodGhpcywgdGhpcy5kYXRhLnRhcmdldEluZGV4KTtcblxuICAgIGNvbnN0IHJvb3QgPSB0aGlzLmVsLm9iamVjdDNEO1xuICAgIHJvb3QudmlzaWJsZSA9IGZhbHNlO1xuICAgIHJvb3QubWF0cml4QXV0b1VwZGF0ZSA9IGZhbHNlO1xuICB9LFxuXG4gIHNldHVwTWFya2VyKFttYXJrZXJXaWR0aCwgbWFya2VySGVpZ2h0XSkge1xuICAgIGNvbnN0IHBvc2l0aW9uID0gbmV3IEFGUkFNRS5USFJFRS5WZWN0b3IzKCk7XG4gICAgY29uc3QgcXVhdGVybmlvbiA9IG5ldyBBRlJBTUUuVEhSRUUuUXVhdGVybmlvbigpO1xuICAgIGNvbnN0IHNjYWxlID0gbmV3IEFGUkFNRS5USFJFRS5WZWN0b3IzKCk7XG4gICAgcG9zaXRpb24ueCA9IG1hcmtlcldpZHRoIC8gMjtcbiAgICBwb3NpdGlvbi55ID0gbWFya2VyV2lkdGggLyAyICsgKG1hcmtlckhlaWdodCAtIG1hcmtlcldpZHRoKSAvIDI7XG4gICAgc2NhbGUueCA9IG1hcmtlcldpZHRoO1xuICAgIHNjYWxlLnkgPSBtYXJrZXJXaWR0aDtcbiAgICBzY2FsZS56ID0gbWFya2VyV2lkdGg7XG4gICAgdGhpcy5wb3N0TWF0cml4ID0gbmV3IEFGUkFNRS5USFJFRS5NYXRyaXg0KCk7XG4gICAgdGhpcy5wb3N0TWF0cml4LmNvbXBvc2UocG9zaXRpb24sIHF1YXRlcm5pb24sIHNjYWxlKTtcbiAgfSxcblxuICB1cGRhdGVXb3JsZE1hdHJpeCh3b3JsZE1hdHJpeCkge1xuICAgIGlmICghdGhpcy5lbC5vYmplY3QzRC52aXNpYmxlICYmIHdvcmxkTWF0cml4ICE9PSBudWxsKSB7XG4gICAgICB0aGlzLmVsLmVtaXQoXCJ0YXJnZXRGb3VuZFwiKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuZWwub2JqZWN0M0QudmlzaWJsZSAmJiB3b3JsZE1hdHJpeCA9PT0gbnVsbCkge1xuICAgICAgdGhpcy5lbC5lbWl0KFwidGFyZ2V0TG9zdFwiKTtcbiAgICB9XG5cbiAgICB0aGlzLmVsLm9iamVjdDNELnZpc2libGUgPSB3b3JsZE1hdHJpeCAhPT0gbnVsbDtcbiAgICBpZiAod29ybGRNYXRyaXggPT09IG51bGwpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIG0gPSBuZXcgQUZSQU1FLlRIUkVFLk1hdHJpeDQoKTtcbiAgICBtLmVsZW1lbnRzID0gd29ybGRNYXRyaXg7XG4gICAgbS5tdWx0aXBseSh0aGlzLnBvc3RNYXRyaXgpO1xuICAgIHRoaXMuZWwub2JqZWN0M0QubWF0cml4ID0gbTtcbiAgfVxufSk7XG4iXSwic291cmNlUm9vdCI6IiJ9