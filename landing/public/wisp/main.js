import {
  scene,
  getControls,
  renderer,
  camera,
  addResize,
  resize,
} from "./modules/renderer.js";
import { Group } from "./third_party/three.module.js";
import {
  mesh,
  mesh2,
  simulation,
  step,
  randomizeColors,
  interpolate,
} from "./wisp.js";
import { Post } from "./post.js";
import { randomInRange, mod, clamp, parabola } from "./modules/Maf.js";
// import { capture } from "./modules/capture.js";

scene.sortObjects = true;

const group = new Group();
mesh.scale.setScalar(0.9);
group.add(mesh);
group.add(mesh2);
scene.add(group);

const post = new Post(renderer);

renderer.shadowMap.enabled = true;

camera.position.set(5, 5, 5);
camera.lookAt(scene.position);

const controls = getControls();
controls.minDistance = 5;
controls.maxDistance = 5;
controls.enablePan = false;
controls.enableZoom = false;
controls.enableRotate = false;

function init() {
  render();
}

let frames = 0;
let invalidate = false;

let time = 0;
let prevTime = performance.now();

// Mouse tracking for orbit controls
let mouseX = 0;
let mouseY = 0;
let targetRotationX = 0;
let targetRotationY = 0;

// Zoom animation state
let isZoomingIn = false;
let zoomStartTime = 0;
const zoomDuration = 1500; // 1.5 seconds
const startCameraPos = { x: 5, y: 5, z: 5 };
const endCameraPos = { x: 0.1, y: 0.1, z: 0.1 }; // Zoom deep but not too close to avoid blackout

window.addEventListener('mousemove', (event) => {
  // Normalize mouse position to -1 to 1
  mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
});

// ── Audio reactivity ──────────────────────────────────────────────────────
// Parent React app posts { type: 'AUDIO_LEVEL', value: 0..1 } on every animation
// frame while ElevenLabs hint audio is playing. We low-pass + ease into the
// target so a single noisy frame doesn't jitter the orb.
let audioLevelTarget = 0;
let audioLevel = 0;
let audioActive = false;
let lastAudioMessage = 0;

window.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'ZOOM_IN') {
    console.log('Received zoom command');
    isZoomingIn = true;
    zoomStartTime = performance.now();
    return;
  }

  if (event.data.type === 'AUDIO_LEVEL') {
    const v = Number(event.data.value);
    if (Number.isFinite(v)) {
      audioLevelTarget = Math.max(0, Math.min(1, v));
      audioActive = true;
      lastAudioMessage = performance.now();
    }
    return;
  }

  if (event.data.type === 'AUDIO_STOP') {
    audioLevelTarget = 0;
    audioActive = false;
    return;
  }
});

function render() {
  const t = performance.now();
  const dt = t - prevTime;
  prevTime = t;

  // Auto-decay audio if parent has gone silent (>250ms without a message means
  // playback ended or React unmounted — orb should breathe back to idle).
  if (audioActive && t - lastAudioMessage > 250) {
    audioLevelTarget = 0;
    audioActive = false;
  }
  // Critically damped lerp toward the target. Attack faster than release so the
  // orb feels punchy on syllable onsets, smooth on tail-offs.
  const k = audioLevelTarget > audioLevel ? 0.35 : 0.08;
  audioLevel += (audioLevelTarget - audioLevel) * k;

  // Handle zoom animation
  if (isZoomingIn) {
    const elapsed = t - zoomStartTime;
    const progress = Math.min(elapsed / zoomDuration, 1);

    // Ease-in cubic function for smooth acceleration (starts slow, accelerates)
    const easeProgress = progress * progress * progress;

    // Interpolate camera position
    camera.position.x = startCameraPos.x + (endCameraPos.x - startCameraPos.x) * easeProgress;
    camera.position.y = startCameraPos.y + (endCameraPos.y - startCameraPos.y) * easeProgress;
    camera.position.z = startCameraPos.z + (endCameraPos.z - startCameraPos.z) * easeProgress;
    camera.lookAt(scene.position);

    // Stop zooming after duration
    if (progress >= 1) {
      isZoomingIn = false;
    }
  }

  if (running || invalidate || isZoomingIn) {
    if (!invalidate) {
      // Idle: field keeps drifting at a *low* baseline velocity so the orb
      // never feels frozen. Speech: `audioLevel` ramps velocity + pulse + roll.
      const IDLE_TIME_SCALE = 0.2; // ~5× slower than the old "silent = 1.0" default
      const SPEECH_TIME_BOOST = 4.6; // peaks near ~4.8× when audioLevel → 1
      const timeScale = IDLE_TIME_SCALE + audioLevel * SPEECH_TIME_BOOST;
      time += dt * 0.1 * timeScale;

      // Slow idle "breath" on scale even when silent; voice adds punch on top.
      const idleBreath = 0.018 * Math.sin(t * 0.0011);
      const pulseScale = 0.9 * (1 + idleBreath + audioLevel * 0.52);
      mesh.scale.setScalar(pulseScale);
      mesh2.scale.setScalar(pulseScale);

      // Always a whisper of Z-roll; speech multiplies the swirl.
      const zIdle = 0.000052;
      const zVoice = 0.00042;
      group.rotation.z += dt * (zIdle + audioLevel * zVoice);

      // Mouse-based rotation (disabled during zoom)
      if (!isZoomingIn) {
        targetRotationX = mouseY * 0.3; // Even more subtle effect
        targetRotationY = -mouseX * 0.3;

        // Smooth lerp to target rotation
        group.rotation.x += (targetRotationX - group.rotation.x) * 0.03;
        group.rotation.y += (targetRotationY - group.rotation.y) * 0.03;
      }
    }
    step(renderer, time / 1000, dt / 16);

    mesh2.material.uniforms.positions.value = simulation.texture;
    interpolate(time, renderer);
    invalidate = false;
  }

  // renderer.render(scene, camera);

  post.render(scene, camera);

  // capture(renderer.domElement);

  // if (frames > 10 * 60 && window.capturer.capturing) {
  //   window.capturer.stop();
  //   window.capturer.save();
  // }
  // frames++;

  renderer.setAnimationLoop(render);
}

randomize();

function randomize() {
  randomizeColors();
  // Opaque black “theater” so lavender particles read clearly (parent can still
  // wrap the iframe in a matching black card on the desk).
  renderer.setClearColor(0x000000, 1);
  const offset = 500;
  mesh.material.uniforms.offset.value = offset;
  simulation.shader.uniforms.offset.value = offset;
  invalidate = true;
}

function goFullscreen() {
  if (renderer.domElement.webkitRequestFullscreen) {
    renderer.domElement.webkitRequestFullscreen();
  } else {
    renderer.domElement.requestFullscreen();
  }
}

let running = true;

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    running = !running;
  }
  if (e.code === "KeyF") {
    goFullscreen();
  }
});

function myResize(w, h, dPR) {
  post.setSize(w * dPR, h * dPR);
}
addResize(myResize);

resize();
init();

// window.start = () => {
//   frames = 0;
//   window.capturer.start();
// };
