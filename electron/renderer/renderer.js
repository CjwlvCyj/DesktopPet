const petFrame = document.getElementById('pet-frame');
const petSurface = document.getElementById('pet-surface');
const bubble = document.getElementById('bubble');

let pack = null;
let currentActionName = 'idle';
let frameIndex = 0;
let animationTimer = null;
let notifyComplete = false;
let paused = false;
let currentBounds = null;
let bubbleTimer = null;
let dragStart = null;
let dragWindow = null;
let dragging = false;
let pointerButton = 0;
let mouseIgnored = false;
let currentScale = 1;
let dragVisualOffsetY = 0;
const boundsCache = new Map();
const PASSIVE_FPS_CAPS = {
  idle: 4
};

function currentAction() {
  return pack?.actions?.[currentActionName] || pack?.actions?.idle;
}

function currentFrames() {
  return currentAction()?.frames || [];
}

function resolveAction(name) {
  if (!pack) return 'idle';
  if (pack.actions[name]) return name;
  const fallback = pack.manifest?.actions?.[name]?.fallback;
  if (fallback && pack.actions[fallback]) return fallback;
  return 'idle';
}

function playAction(name, options = {}) {
  if (!pack) return;
  currentActionName = resolveAction(name);
  frameIndex = 0;
  notifyComplete = !!options.notifyComplete;
  drawFrame();
  scheduleNextFrame();
}

function applyCanvasSize() {
  const width = Number(pack?.manifest?.canvas?.width) || 768;
  const height = Number(pack?.manifest?.canvas?.height) || 768;
  document.documentElement.style.setProperty('--surface-width', `${Math.round(width * currentScale)}px`);
  document.documentElement.style.setProperty('--surface-height', `${Math.round(height * currentScale)}px`);
}

function applyDragVisualOffset(offsetY) {
  const nextOffset = Math.round(Number(offsetY) || 0);
  if (dragVisualOffsetY === nextOffset) return;
  dragVisualOffsetY = nextOffset;
  petSurface.style.transform = nextOffset === 0 ? '' : `translateY(${nextOffset}px)`;
}

function drawFrame() {
  const frames = currentFrames();
  const source = frames[frameIndex];
  if (!source) return;
  if (boundsCache.has(source)) {
    currentBounds = boundsCache.get(source);
    petFrame.onload = null;
  } else {
    petFrame.onload = () => updateBoundsFromImage(source);
  }
  petFrame.src = source;
}

function scheduleNextFrame() {
  clearTimeout(animationTimer);
  if (paused) return;
  const action = currentAction();
  if (!action) return;
  const fps = Math.max(1, Math.min(action.fps, PASSIVE_FPS_CAPS[currentActionName] ?? action.fps));
  animationTimer = setTimeout(() => {
    const frames = currentFrames();
    const next = frameIndex + 1;
    if (next >= frames.length) {
      if (action.loop) {
        frameIndex = 0;
      } else {
        if (notifyComplete) window.desktopPet.sendPetEvent('actionCompleted');
        return;
      }
    } else {
      frameIndex = next;
    }
    drawFrame();
    scheduleNextFrame();
  }, 1000 / fps);
}

function updateBoundsFromImage(source) {
  const canvas = document.createElement('canvas');
  canvas.width = petFrame.naturalWidth || 768;
  canvas.height = petFrame.naturalHeight || 768;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(petFrame, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;

  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const alpha = data[(y * canvas.width + x) * 4 + 3];
      if (alpha > 12) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX >= minX && maxY >= minY) {
    currentBounds = {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  } else {
    currentBounds = null;
  }
  boundsCache.set(source, currentBounds);
}

function isInsidePet(event) {
  if (!currentBounds) return true;
  const x = event.clientX / currentScale;
  const y = (event.clientY - dragVisualOffsetY) / currentScale;
  return x >= currentBounds.x
    && x <= currentBounds.x + currentBounds.width
    && y >= currentBounds.y
    && y <= currentBounds.y + currentBounds.height;
}

function setMouseIgnored(ignored) {
  const nextValue = dragging ? false : !!ignored;
  if (mouseIgnored === nextValue) return;
  mouseIgnored = nextValue;
  window.desktopPet.setMouseIgnore(nextValue);
}

function updateMousePassthrough(event) {
  setMouseIgnored(!isInsidePet(event));
}

function capturePointer(event) {
  try {
    document.body.setPointerCapture?.(event.pointerId);
  } catch {
    // Pointer capture is only a drag stability hint; interaction still works without it.
  }
}

function releasePointer(event) {
  try {
    document.body.releasePointerCapture?.(event.pointerId);
  } catch {
    // See capturePointer.
  }
}

function showBubble(text) {
  if (!text) return;
  clearTimeout(bubbleTimer);
  const bounds = currentBounds || { x: 256, y: 256, width: 256, height: 256 };
  bubble.textContent = text;
  bubble.style.left = `${(bounds.x + bounds.width / 2) * currentScale}px`;
  bubble.style.top = `${Math.max(16, (bounds.y - 8) * currentScale)}px`;
  bubble.style.display = 'block';
  bubbleTimer = setTimeout(() => {
    bubble.style.display = 'none';
  }, 2800);
}

window.desktopPet.onPetPackLoaded((payload) => {
  pack = payload;
  boundsCache.clear();
  currentScale = Number(payload.scale) || Number(payload.manifest?.defaultScale) || 1;
  applyCanvasSize();
  setMouseIgnored(false);
  playAction('idle');
});

window.desktopPet.onPetScaleChanged(({ scale }) => {
  currentScale = Number(scale) || currentScale;
  applyCanvasSize();
});

window.desktopPet.onPlayAction(({ actionName, notifyComplete: shouldNotify }) => {
  playAction(actionName, { notifyComplete: shouldNotify });
});

window.desktopPet.onShowBubble(({ text }) => {
  showBubble(text);
});

window.desktopPet.onRendererPaused((isPaused) => {
  paused = isPaused;
  if (paused) {
    clearTimeout(animationTimer);
  } else {
    scheduleNextFrame();
  }
});

window.desktopPet.onDragVisualOffset(({ offsetY }) => {
  applyDragVisualOffset(offsetY);
});

window.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

window.addEventListener('pointerdown', async (event) => {
  if (event.button !== 0 && event.button !== 2) return;
  if (!isInsidePet(event)) {
    setMouseIgnored(true);
    return;
  }
  setMouseIgnored(false);
  capturePointer(event);
  pointerButton = event.button;
  dragStart = { x: event.screenX, y: event.screenY };
  dragWindow = await window.desktopPet.getWindowBounds();
  dragging = false;
});

window.addEventListener('pointermove', (event) => {
  if (!dragStart) updateMousePassthrough(event);
  if (!dragStart || !dragWindow) return;
  if (pointerButton !== 0) return;
  const dx = event.screenX - dragStart.x;
  const dy = event.screenY - dragStart.y;
  const distance = Math.hypot(dx, dy);
  if (!dragging && distance > 3) {
    dragging = true;
    setMouseIgnored(false);
    window.desktopPet.beginDrag({
      windowX: dragWindow.x,
      windowY: dragWindow.y,
      cursorX: dragStart.x,
      cursorY: dragStart.y,
      visualOffsetY: dragVisualOffsetY,
      scale: currentScale,
      bounds: currentBounds
    });
    window.desktopPet.sendPetEvent('dragStarted');
  }
});

function resetPointerState(event) {
  releasePointer(event);
  dragStart = null;
  dragWindow = null;
  dragging = false;
  pointerButton = 0;
}

window.addEventListener('pointerup', (event) => {
  if (!dragStart) return;
  if (dragging) {
    window.desktopPet.endDrag();
    window.desktopPet.sendPetEvent('dragEnded');
  } else if (pointerButton === 2) {
    window.desktopPet.sendPetEvent('walkRequested');
  } else {
    window.desktopPet.sendPetEvent('petClicked');
  }
  resetPointerState(event);
});

window.addEventListener('pointercancel', (event) => {
  if (dragging) {
    window.desktopPet.endDrag();
    window.desktopPet.sendPetEvent('dragEnded');
  }
  resetPointerState(event);
});

window.addEventListener('pointerleave', () => {
  if (!dragging) setMouseIgnored(true);
});

window.addEventListener('mousemove', (event) => {
  if (!dragStart) updateMousePassthrough(event);
});
