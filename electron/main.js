const { app, BrowserWindow, Tray, Menu, dialog, ipcMain, nativeImage, screen, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pathToFileURL } = require('url');

const { installPetPack, validatePetPack } = require('./petpack');
const { PetStore } = require('./store');
const {
  PetState,
  SCALE_MIN,
  SCALE_MAX,
  SCALE_STEP,
  DEFAULT_SCALE,
  DEFAULT_CANVAS_SIZE,
  WINDOW_MIN_SIZE,
  WINDOW_MAX_SIZE,
  WALK_MIN_DISTANCE,
  WALK_DISTANCE_RANGE,
  WALK_VERTICAL_RANGE,
  WALK_ANIMATION_DURATION,
  AUTO_WALK_MIN_DELAY,
  AUTO_WALK_DELAY_RANGE,
  IDLE_VARIANT_MIN_DELAY,
  IDLE_VARIANT_DELAY_RANGE,
  IDLE_VARIANT_ACTIONS,
  DRAG_TIMEOUT,
  ANIMATION_TICK_MS
} = require('./constants');

// ---------------------------------------------------------------------------
// Global error handlers — log to stderr so problems are visible in dev tools
// ---------------------------------------------------------------------------
process.on('uncaughtException', (error) => {
  console.error('[DesktopPet] Uncaught exception:', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('[DesktopPet] Unhandled rejection:', reason);
});

let petWindow = null;
let settingsWindow = null;
let tray = null;
let currentPack = null;
let currentScale = 1;
let clickThrough = false;
let alwaysOnTop = true;
let visible = true;
let state = PetState.IDLE;
let walkTimer = null;
let idleVariantTimer = null;
let moveTimer = null;
let manualDragTimer = null;
let manualDragSession = null;
let dragVisualOffsetY = 0;
let contentMouseIgnored = false;

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PACK_PATH = path.join(ROOT, 'Resources', 'DefaultPetPack');
const YUANBAO_PACK_PATH = path.join(ROOT, 'Yuanbao.petpack');
let store;

function preferredInitialPackPath() {
  const saved = store.get('activePetPackPath');
  if (saved && fs.existsSync(saved)) return saved;
  if (fs.existsSync(YUANBAO_PACK_PATH)) return YUANBAO_PACK_PATH;
  return DEFAULT_PACK_PATH;
}

function installedPackRoot() {
  return path.join(app.getPath('userData'), 'PetPacks');
}

function createPetWindow() {
  petWindow = new BrowserWindow({
    width: 768,
    height: 768,
    x: 160,
    y: 160,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      sandbox: false
    }
  });

  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  petWindow.webContents.on('did-finish-load', () => {
    if (currentPack) sendCurrentPackToRenderer();
  });
  petWindow.once('ready-to-show', () => {
    restoreWindowPosition();
    loadPetPack(preferredInitialPackPath());
    petWindow.showInactive();
    scheduleWalk();
    scheduleIdleVariant();
  });

  petWindow.on('moved', () => {
    if (manualDragSession) return;
    store.set('windowBounds', petWindow.getBounds());
  });
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 320,
    height: 156,
    frame: false,
    transparent: true,
    hasShadow: true,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
      sandbox: false
    }
  });

  settingsWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  settingsWindow.loadFile(path.join(__dirname, 'settings', 'index.html'));
  settingsWindow.webContents.on('did-finish-load', sendSettingsState);
  settingsWindow.on('blur', () => settingsWindow?.hide());
}

function createTray() {
  const trayIcon = createTrayIcon();
  tray = new Tray(trayIcon);
  tray.setToolTip('Desktop Pet');
  if (trayIcon.isEmpty()) {
    tray.setTitle('Pet');
  }
  updateTrayMenu();
}

function createTrayIcon() {
  const iconSize = 16;
  const paw = nativeImage.createFromBuffer(createPawTemplatePNG(iconSize * 2), { scaleFactor: 2 });
  paw.setTemplateImage(true);
  return paw;
}

function createPawTemplatePNG(size = 32) {
  const scale = 4;
  const hiSize = size * scale;
  const hi = new Uint8ClampedArray(hiSize * hiSize);

  for (let y = 0; y < hiSize; y += 1) {
    for (let x = 0; x < hiSize; x += 1) {
      const px = ((x + 0.5) / scale) * 36 / size;
      const py = ((y + 0.5) / scale) * 36 / size;
      if (insidePaw(px, py)) hi[y * hiSize + x] = 255;
    }
  }

  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let alpha = 0;
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          alpha += hi[(y * scale + sy) * hiSize + (x * scale + sx)];
        }
      }
      alpha = Math.round(alpha / (scale * scale));
      const offset = (y * size + x) * 4;
      rgba[offset] = 0;
      rgba[offset + 1] = 0;
      rgba[offset + 2] = 0;
      rgba[offset + 3] = alpha;
    }
  }

  return encodePNG(size, size, rgba);
}

function insidePaw(x, y) {
  return ellipse(x, y, 8.2, 14.2, 4.0, 5.2)
    || ellipse(x, y, 14.8, 9.0, 4.1, 5.5)
    || ellipse(x, y, 21.2, 9.0, 4.1, 5.5)
    || ellipse(x, y, 27.8, 14.2, 4.0, 5.2)
    || ellipse(x, y, 13.6, 24.2, 6.1, 7.8)
    || ellipse(x, y, 22.4, 24.2, 6.1, 7.8)
    || ellipse(x, y, 18.0, 27.5, 9.4, 7.2);
}

function ellipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const chunk = Buffer.alloc(8 + data.length + 4);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function updateTrayMenu() {
  if (!tray) return;

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: visible ? '隐藏宠物' : '显示宠物',
      click: toggleVisibility
    },
    {
      label: '鼠标穿透',
      type: 'checkbox',
      checked: clickThrough,
      click: toggleClickThrough
    },
    {
      label: '始终置顶',
      type: 'checkbox',
      checked: alwaysOnTop,
      click: toggleAlwaysOnTop
    },
    { label: '大小...', enabled: !!currentPack, click: toggleSettingsPanel },
    { label: '重置位置', click: resetPosition },
    { type: 'separator' },
    { label: '动作', enabled: !!currentPack, submenu: buildActionMenu() },
    { label: '休息', click: () => handlePetEvent('restRequested') },
    { label: '使用元宝示例', enabled: fs.existsSync(YUANBAO_PACK_PATH), click: () => loadPetPack(YUANBAO_PACK_PATH) },
    { label: '使用默认宠物', click: () => loadPetPack(DEFAULT_PACK_PATH) },
    { label: '导入 PetPack...', click: importPetPack },
    { label: '显示当前资源包', enabled: !!currentPack, click: revealCurrentPack },
    { type: 'separator' },
    { label: '重新加载窗口', click: () => petWindow?.reload() },
    { label: '退出', click: () => app.quit() }
  ]));
}

function buildActionMenu() {
  return [
    menuSection('待机'),
    actionMenuItem('静坐', 'idle', { loop: true }),
    actionMenuItem('绕圈', 'idle_spin'),
    actionMenuItem('打哈欠', 'idle_yawn'),
    { type: 'separator' },
    menuSection('行走'),
    { label: '随机', enabled: !!currentPack, click: startMenuRandomWalk },
    {
      label: '向左',
      enabled: actionExists('walk_left') || actionExists('walk'),
      click: () => startDirectedWalk(-1)
    },
    {
      label: '向右',
      enabled: actionExists('walk_right') || actionExists('walk'),
      click: () => startDirectedWalk(1)
    },
    { type: 'separator' },
    menuSection('互动'),
    actionMenuItem('开心跳', 'tap_happy'),
    actionMenuItem('提起悬空', 'dragged', { loop: true })
  ];
}

function menuSection(label) {
  return { label, enabled: false };
}

function actionMenuItem(label, actionName, options = {}) {
  return {
    label,
    enabled: actionExists(actionName),
    click: () => playMenuAction(actionName, options)
  };
}

function actionExists(actionName) {
  return !!currentPack?.manifest?.actions?.[actionName];
}

function loadPetPack(packPath) {
  try {
    const pack = validatePetPack(packPath);
    activatePetPack(pack);
  } catch (error) {
    dialog.showErrorBox('PetPack 加载失败', error.message);
  }
}

function activatePetPack(pack) {
  const previousPackPath = store.get('activePetPackPath');
  currentPack = pack;
  currentScale = getPetScale(pack);
  state = PetState.IDLE;
  store.set('activePetPackPath', pack.basePath);
  resizeWindowForPack(pack, { clearVisualOffset: previousPackPath !== pack.basePath });
  sendCurrentPackToRenderer();
  sendSettingsState();
  updateTrayMenu();
  scheduleIdleVariant();
}

function sendCurrentPackToRenderer() {
  if (!petWindow || !currentPack || petWindow.webContents.isLoading()) return;
  petWindow.webContents.send('petpack-loaded', packForRenderer(currentPack));
  sendDragVisualOffset();
}

function packForRenderer(pack) {
  const actions = {};
  for (const [name, action] of Object.entries(pack.manifest.actions)) {
    actions[name] = {
      ...action,
      frames: pack.frames[name].map((filePath) => pathToFileURL(filePath).href)
    };
  }

  return {
    basePath: pack.basePath,
    manifest: pack.manifest,
    bubbles: pack.bubbles,
    scale: currentScale,
    actions
  };
}

async function importPetPack() {
  const result = await dialog.showOpenDialog({
    title: '选择 PetPack 文件夹',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return;
  try {
    const pack = installPetPack(result.filePaths[0], installedPackRoot());
    activatePetPack(pack);
  } catch (error) {
    dialog.showErrorBox('PetPack 导入失败', error.message);
  }
}

function revealCurrentPack() {
  if (!currentPack) return;
  shell.showItemInFolder(path.join(currentPack.basePath, 'manifest.json'));
}

function toggleVisibility() {
  if (!petWindow) return;
  visible = !visible;
  if (visible) {
    petWindow.showInactive();
    petWindow.webContents.send('renderer-paused', false);
    scheduleWalk();
    scheduleIdleVariant();
  } else {
    petWindow.hide();
    petWindow.webContents.send('renderer-paused', true);
    stopWalk();
    stopIdleVariant();
  }
  updateTrayMenu();
}

function toggleClickThrough() {
  clickThrough = !clickThrough;
  store.set('clickThrough', clickThrough);
  applyMouseIgnore();
  updateTrayMenu();
}

function toggleAlwaysOnTop() {
  alwaysOnTop = !alwaysOnTop;
  petWindow?.setAlwaysOnTop(alwaysOnTop, 'floating');
  store.set('alwaysOnTop', alwaysOnTop);
  updateTrayMenu();
}

function toggleSettingsPanel() {
  if (!settingsWindow || !currentPack) return;
  if (settingsWindow.isVisible()) {
    settingsWindow.hide();
    return;
  }
  positionSettingsWindow();
  settingsWindow.show();
  settingsWindow.focus();
  sendSettingsState();
}

function positionSettingsWindow() {
  if (!settingsWindow) return;
  const panelBounds = settingsWindow.getBounds();
  const trayBounds = tray?.getBounds();
  const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const display = trayBounds ? screen.getDisplayMatching(trayBounds) : cursorDisplay;
  const frame = display.bounds;
  const anchorX = trayBounds ? trayBounds.x + trayBounds.width / 2 : frame.x + frame.width - 180;
  let x = Math.round(anchorX - panelBounds.width / 2);
  let y = trayBounds ? Math.round(trayBounds.y + trayBounds.height + 8) : Math.round(frame.y + 36);

  x = Math.max(frame.x + 8, Math.min(x, frame.x + frame.width - panelBounds.width - 8));
  if (y + panelBounds.height > frame.y + frame.height - 8) {
    y = Math.round((trayBounds?.y ?? frame.y) - panelBounds.height - 8);
  }
  y = Math.max(frame.y + 8, Math.min(y, frame.y + frame.height - panelBounds.height - 8));
  settingsWindow.setPosition(x, y, false);
}

function resetPosition() {
  if (!petWindow) return;
  setDragVisualOffset(0, { persist: true });
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const bounds = petWindow.getBounds();
  const frame = display.bounds;
  const x = Math.round(frame.x + (frame.width - bounds.width) / 2);
  const y = Math.round(frame.y + frame.height - bounds.height);
  petWindow.setPosition(x, y, false);
  store.set('windowBounds', petWindow.getBounds());
}

function restoreWindowPosition() {
  dragVisualOffsetY = Number(store.get('dragVisualOffsetY', 0)) || 0;
  const saved = store.get('windowBounds');
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    petWindow.setBounds({
      x: saved.x,
      y: saved.y,
      width: Number.isFinite(saved.width) ? saved.width : 768,
      height: Number.isFinite(saved.height) ? saved.height : 768
    });
    recoverWindowIfOffscreen();
  } else {
    resetPosition();
  }
  clickThrough = !!store.get('clickThrough', false);
  alwaysOnTop = store.get('alwaysOnTop', true) !== false;
  petWindow.setAlwaysOnTop(alwaysOnTop, 'floating');
  applyMouseIgnore();
}

function recoverWindowIfOffscreen() {
  if (!petWindow) return;
  const bounds = petWindow.getBounds();
  if (!intersectsAnyDisplay(bounds)) resetPosition();
}

function clampToDisplayBounds() {
  if (!petWindow) return;
  const bounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const frame = display.bounds;
  const position = clampPositionToFrame(bounds.x, bounds.y, bounds, frame);
  const x = position.x;
  const y = position.y;
  if (x !== bounds.x || y !== bounds.y) petWindow.setPosition(x, y, false);
}

function intersectsAnyDisplay(bounds) {
  return screen.getAllDisplays().some((display) => rectanglesIntersect(bounds, display.bounds));
}

function rectanglesIntersect(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

function clampPositionToFrame(x, y, bounds, frame) {
  if (bounds.width >= frame.width) {
    x = Math.round(frame.x + (frame.width - bounds.width) / 2);
  } else {
    x = Math.max(frame.x, Math.min(x, frame.x + frame.width - bounds.width));
  }

  if (bounds.height >= frame.height) {
    y = Math.round(frame.y + (frame.height - bounds.height) / 2);
  } else {
    y = Math.max(frame.y, Math.min(y, frame.y + frame.height - bounds.height));
  }

  return { x, y };
}

function resizeWindowForPack(pack, options = {}) {
  if (!petWindow) return;
  const { preserveBottomCenter = true, recoverIfOffscreen = true, clearVisualOffset = true } = options;
  if (clearVisualOffset) setDragVisualOffset(0, { persist: true });
  const oldBounds = petWindow.getBounds();
  const bottomCenter = {
    x: oldBounds.x + oldBounds.width / 2,
    y: oldBounds.y + oldBounds.height
  };
  const width = Number(pack.manifest?.canvas?.width) || DEFAULT_CANVAS_SIZE;
  const height = Number(pack.manifest?.canvas?.height) || DEFAULT_CANVAS_SIZE;
  const boundedWidth = Math.max(WINDOW_MIN_SIZE, Math.min(WINDOW_MAX_SIZE, Math.round(width * currentScale)));
  const boundedHeight = Math.max(WINDOW_MIN_SIZE, Math.min(WINDOW_MAX_SIZE, Math.round(height * currentScale)));
  petWindow.setContentSize(boundedWidth, boundedHeight, false);

  if (preserveBottomCenter) {
    const nextBounds = petWindow.getBounds();
    petWindow.setPosition(
      Math.round(bottomCenter.x - nextBounds.width / 2),
      Math.round(bottomCenter.y - nextBounds.height),
      false
    );
  }

  if (recoverIfOffscreen) recoverWindowIfOffscreen();
  store.set('windowBounds', petWindow.getBounds());
}

function setDragVisualOffset(offsetY, options = {}) {
  const nextOffset = Math.round(Number(offsetY) || 0);
  if (dragVisualOffsetY !== nextOffset) {
    dragVisualOffsetY = nextOffset;
    sendDragVisualOffset();
  }
  if (options.persist) store.set('dragVisualOffsetY', dragVisualOffsetY);
}

function sendDragVisualOffset() {
  if (!petWindow || petWindow.webContents.isLoading()) return;
  petWindow.webContents.send('drag-visual-offset', { offsetY: dragVisualOffsetY });
}

function applyMouseIgnore() {
  if (!petWindow) return;
  petWindow.setIgnoreMouseEvents(clickThrough || contentMouseIgnored, { forward: true });
}

function defaultScaleForPack(pack) {
  return clampScale(Number(pack?.manifest?.defaultScale) || DEFAULT_SCALE);
}

function getPetScale(pack) {
  const packId = pack?.manifest?.id;
  const scales = store.get('petScaleByPackId', {});
  const saved = packId && typeof scales === 'object' ? Number(scales[packId]) : NaN;
  return Number.isFinite(saved) ? clampScale(saved) : defaultScaleForPack(pack);
}

function setPetScale(scale) {
  if (!currentPack) return settingsState();
  currentScale = quantizeScale(scale);
  const scales = { ...store.get('petScaleByPackId', {}) };
  scales[currentPack.manifest.id] = currentScale;
  store.set('petScaleByPackId', scales);
  resizeWindowForPack(currentPack, { preserveBottomCenter: true, recoverIfOffscreen: false });
  petWindow?.webContents.send('pet-scale-changed', { scale: currentScale });
  sendSettingsState();
  return settingsState();
}

function resetPetScale() {
  if (!currentPack) return settingsState();
  const scales = { ...store.get('petScaleByPackId', {}) };
  delete scales[currentPack.manifest.id];
  store.set('petScaleByPackId', scales);
  currentScale = defaultScaleForPack(currentPack);
  resizeWindowForPack(currentPack, { preserveBottomCenter: true, recoverIfOffscreen: false });
  petWindow?.webContents.send('pet-scale-changed', { scale: currentScale });
  sendSettingsState();
  return settingsState();
}

function clampScale(value) {
  const finite = Number.isFinite(value) ? value : DEFAULT_SCALE;
  return Math.max(SCALE_MIN, Math.min(SCALE_MAX, Number(finite.toFixed(2))));
}

function quantizeScale(value) {
  return clampScale(Math.round(value / SCALE_STEP) * SCALE_STEP);
}

function settingsState() {
  const defaultScale = currentPack ? defaultScaleForPack(currentPack) : DEFAULT_SCALE;
  return {
    packId: currentPack?.manifest?.id ?? null,
    displayName: currentPack?.manifest?.displayName ?? 'Desktop Pet',
    scale: currentScale,
    defaultScale,
    min: SCALE_MIN,
    max: SCALE_MAX,
    step: SCALE_STEP
  };
}

function sendSettingsState() {
  if (!settingsWindow || settingsWindow.webContents.isLoading()) return;
  settingsWindow.webContents.send('settings-state', settingsState());
}

function startWalk(options = {}) {
  if (!petWindow || !currentPack || !visible || state === PetState.DRAGGING) return;
  state = PetState.WALKING;
  setDragVisualOffset(0, { persist: true });
  if (options.announce) showBubble('walk');
  movePetByRandomStep();
}

function startDirectedWalk(direction) {
  if (!petWindow || !currentPack) return;
  prepareMenuAction();
  state = PetState.WALKING;
  setDragVisualOffset(0, { persist: true });

  const bounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const frame = display.bounds;
  const dx = Math.sign(direction || 1) * Math.round(WALK_MIN_DISTANCE + WALK_DISTANCE_RANGE * 0.55);
  // eslint-disable-next-line no-shadow -- intentional block-scoped `target`
  const target = clampPositionToFrame(
    Math.round(bounds.x + dx),
    bounds.y,
    bounds,
    frame
  );

  playAction(walkActionForDirection(dx), false);
  animateWindowMove(bounds, target, WALK_ANIMATION_DURATION, () => {
    state = PetState.IDLE;
    playAction('idle', false);
  });
}

function startMenuRandomWalk() {
  if (!petWindow || !currentPack) return;
  prepareMenuAction();
  startWalk({ announce: true });
}

function playMenuAction(actionName, options = {}) {
  if (!petWindow || !currentPack || !actionExists(actionName)) return;
  prepareMenuAction();

  if (actionName === 'idle') {
    state = PetState.IDLE;
    playAction('idle', false);
    return;
  }

  const action = currentPack.manifest.actions[actionName];
  state = PetState.MANUAL_ACTION;
  const notifyComplete = options.loop ? false : !action.loop;
  playAction(actionName, notifyComplete);
}

function prepareMenuAction() {
  if (!petWindow) return;
  if (!visible) {
    visible = true;
    petWindow.showInactive();
    petWindow.webContents.send('renderer-paused', false);
    scheduleWalk();
    scheduleIdleVariant();
    updateTrayMenu();
  }

  clearInterval(moveTimer);
  moveTimer = null;
  endManualDrag({ persist: false });
  setDragVisualOffset(0, { persist: true });
}

function handlePetEvent(eventName) {
  if (!petWindow || !currentPack) return;

  switch (eventName) {
    case 'petClicked':
      if (state === PetState.DRAGGING) return;
      state = PetState.TAPPED;
      playAction('tap_happy', true);
      showBubble('tap_happy');
      break;
    case 'walkRequested':
      startWalk({ announce: true });
      scheduleWalk();
      break;
    case 'dragStarted':
      state = PetState.DRAGGING;
      playAction('dragged', false);
      break;
    case 'dragEnded':
      endManualDrag();
      state = PetState.IDLE;
      playAction('idle', false);
      break;
    case 'idleTimerFired':
      if (state !== PetState.IDLE || !visible) return;
      startWalk();
      break;
    case 'idleVariantTimerFired':
      if (state !== PetState.IDLE || !visible) return;
      playIdleVariant();
      break;
    case 'restRequested':
      state = state === PetState.RESTING ? PetState.IDLE : PetState.RESTING;
      playAction(state === PetState.RESTING ? 'rest' : 'idle', false);
      if (state === PetState.RESTING) showBubble('rest');
      break;
    case 'actionCompleted':
      if (state === PetState.TAPPED || state === PetState.IDLE_VARIANT || state === PetState.MANUAL_ACTION) {
        state = PetState.IDLE;
        playAction('idle', false);
      }
      break;
    case 'packChanged':
      state = PetState.IDLE;
      playAction('idle', false);
      break;
    default:
      break;
  }
}

function playAction(actionName, notifyComplete) {
  petWindow.webContents.send('play-action', { actionName, notifyComplete });
}

function showBubble(actionName) {
  const bubbles = currentPack?.bubbles?.[actionName] || currentPack?.bubbles?.idle || [];
  if (!bubbles.length) return;
  const text = bubbles[Math.floor(Math.random() * bubbles.length)];
  petWindow.webContents.send('show-bubble', { text });
}

function movePetByRandomStep() {
  if (!petWindow) return;
  const bounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const frame = display.bounds;
  const direction = Math.random() > 0.5 ? 1 : -1;
  const dx = direction * (WALK_MIN_DISTANCE + Math.random() * WALK_DISTANCE_RANGE);
  const dy = -WALK_VERTICAL_RANGE / 2 + Math.random() * WALK_VERTICAL_RANGE;
  const target = clampPositionToFrame(
    Math.round(bounds.x + dx),
    Math.round(bounds.y + dy),
    bounds,
    frame
  );

  playAction(walkActionForDirection(dx), false);
  animateWindowMove(bounds, target, WALK_ANIMATION_DURATION, () => {
    state = PetState.IDLE;
    playAction('idle', false);
  });
}

function walkActionForDirection(dx) {
  const preferred = dx >= 0 ? 'walk_right' : 'walk_left';
  if (currentPack?.manifest?.actions?.[preferred]) return preferred;
  if (currentPack?.manifest?.actions?.walk) return 'walk';
  return 'idle';
}

function beginManualDrag(payload) {
  if (!petWindow || !payload) return;
  const cursorX = Number(payload.cursorX);
  const cursorY = Number(payload.cursorY);
  const windowX = Number(payload.windowX);
  const windowY = Number(payload.windowY);
  const visualOffsetY = Number(payload.visualOffsetY) || 0;
  const scale = Number(payload.scale) || currentScale || 1;
  if (![cursorX, cursorY, windowX, windowY].every(Number.isFinite)) return;

  clearInterval(moveTimer);
  moveTimer = null;
  endManualDrag({ persist: false });
  const bounds = payload.bounds && typeof payload.bounds === 'object' ? payload.bounds : null;
  manualDragSession = {
    cursorX,
    cursorY,
    windowX,
    windowY,
    visualOffsetY,
    scale,
    visibleBottomY: Number(bounds?.y) + Number(bounds?.height),
    startedAt: Date.now()
  };
  updateManualDragPosition();
  manualDragTimer = setInterval(updateManualDragPosition, ANIMATION_TICK_MS);
}

function updateManualDragPosition() {
  if (!petWindow || !manualDragSession) return;
  if (Date.now() - manualDragSession.startedAt > DRAG_TIMEOUT) {
    endManualDrag();
    handlePetEvent('dragEnded');
    return;
  }

  const cursor = screen.getCursorScreenPoint();
  const desiredX = Math.round(manualDragSession.windowX + cursor.x - manualDragSession.cursorX);
  const desiredY = Math.round(
    manualDragSession.windowY
      + manualDragSession.visualOffsetY
      + cursor.y
      - manualDragSession.cursorY
  );

  petWindow.setPosition(desiredX, desiredY, false);

  const actual = petWindow.getBounds();
  const maxNegativeOffset = Number.isFinite(manualDragSession.visibleBottomY)
    ? -Math.round(Math.max(0, manualDragSession.visibleBottomY * manualDragSession.scale - 32))
    : -Math.round(actual.height * 0.88);
  const nextOffset = Math.max(maxNegativeOffset, Math.min(0, desiredY - actual.y));
  setDragVisualOffset(nextOffset);
}

function endManualDrag(options = {}) {
  const { persist = true } = options;
  clearInterval(manualDragTimer);
  manualDragTimer = null;
  manualDragSession = null;
  if (persist && petWindow) {
    store.set('windowBounds', petWindow.getBounds());
    store.set('dragVisualOffsetY', dragVisualOffsetY);
  }
}

function animateWindowMove(from, to, duration, done) {
  clearInterval(moveTimer);
  const started = Date.now();
  moveTimer = setInterval(() => {
    // ~60 fps tick for smooth window animation
    const t = Math.min(1, (Date.now() - started) / duration);
    const eased = 0.5 - Math.cos(t * Math.PI) / 2;
    const x = Math.round(from.x + (to.x - from.x) * eased);
    const y = Math.round(from.y + (to.y - from.y) * eased);
    petWindow?.setPosition(x, y, false);
    if (t >= 1) {
      clearInterval(moveTimer);
      moveTimer = null;
      done?.();
    }
  }, ANIMATION_TICK_MS);
}

function scheduleWalk() {
  stopWalk();
  if (!visible) return;
  const delay = AUTO_WALK_MIN_DELAY + Math.random() * AUTO_WALK_DELAY_RANGE;
  walkTimer = setTimeout(() => {
    handlePetEvent('idleTimerFired');
    scheduleWalk();
  }, delay);
}

function stopWalk() {
  clearTimeout(walkTimer);
  walkTimer = null;
}

function scheduleIdleVariant() {
  stopIdleVariant();
  if (!visible) return;
  const delay = IDLE_VARIANT_MIN_DELAY + Math.random() * IDLE_VARIANT_DELAY_RANGE;
  idleVariantTimer = setTimeout(() => {
    handlePetEvent('idleVariantTimerFired');
    scheduleIdleVariant();
  }, delay);
}

function stopIdleVariant() {
  clearTimeout(idleVariantTimer);
  idleVariantTimer = null;
}

function playIdleVariant() {
  if (!petWindow || !currentPack) return;
  const availableActions = IDLE_VARIANT_ACTIONS.filter((actionName) => currentPack.manifest?.actions?.[actionName]);
  if (!availableActions.length) return;
  const actionName = availableActions[Math.floor(Math.random() * availableActions.length)];
  state = PetState.IDLE_VARIANT;
  playAction(actionName, true);
}

function setupIPC() {
  ipcMain.on('pet-event', (_, eventName) => handlePetEvent(eventName));
  ipcMain.on('set-content-mouse-ignored', (_, ignored) => {
    contentMouseIgnored = !!ignored;
    applyMouseIgnore();
  });
  ipcMain.handle('get-settings-state', () => settingsState());
  ipcMain.handle('set-pet-scale', (_, scale) => setPetScale(scale));
  ipcMain.handle('reset-pet-scale', () => resetPetScale());
  ipcMain.on('begin-drag', (_, payload) => beginManualDrag(payload));
  ipcMain.on('end-drag', () => endManualDrag());
  ipcMain.handle('get-window-bounds', () => petWindow?.getBounds());
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  store = new PetStore(path.join(app.getPath('userData'), 'preferences.json'));
  createPetWindow();
  createSettingsWindow();
  createTray();
  setupIPC();
  screen.on('display-removed', recoverWindowIfOffscreen);
  screen.on('display-added', recoverWindowIfOffscreen);
});

app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  stopWalk();
  stopIdleVariant();
  clearInterval(moveTimer);
  endManualDrag({ persist: false });
  store?.flush?.();
});
