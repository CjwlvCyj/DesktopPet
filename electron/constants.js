/**
 * Shared constants for the Desktop Pet Electron application.
 *
 * Centralises magic numbers previously scattered across main.js and renderer.js
 * so they can be tuned in one place and documented in context.
 */

// ---------------------------------------------------------------------------
// Pet state machine states
// ---------------------------------------------------------------------------

/** @enum {string} */
const PetState = Object.freeze({
  IDLE: 'idle',
  WALKING: 'walking',
  TAPPED: 'tapped',
  DRAGGING: 'dragging',
  RESTING: 'resting',
  IDLE_VARIANT: 'idle_variant',
  MANUAL_ACTION: 'manual_action'
});

// ---------------------------------------------------------------------------
// Canvas & scaling
// ---------------------------------------------------------------------------

/** Default canvas dimension when manifest doesn't specify one. */
const DEFAULT_CANVAS_SIZE = 768;

/** Scale limits for the pet size slider. */
const SCALE_MIN = 0.35;
const SCALE_MAX = 1.1;
const SCALE_STEP = 0.05;

/** Fallback default scale when manifest doesn't define one. */
const DEFAULT_SCALE = 0.67;

/** Hard limits on window pixel dimensions to keep things sane. */
const WINDOW_MIN_SIZE = 128;
const WINDOW_MAX_SIZE = 1400;

// ---------------------------------------------------------------------------
// Walk behaviour
// ---------------------------------------------------------------------------

/** Minimum horizontal walk distance (px). */
const WALK_MIN_DISTANCE = 180;

/** Extra random range added on top of WALK_MIN_DISTANCE (px). */
const WALK_DISTANCE_RANGE = 280;

/** Vertical wander range during a walk step (px, ±half). */
const WALK_VERTICAL_RANGE = 120;

/** Walk animation duration (ms). */
const WALK_ANIMATION_DURATION = 2100;

/** Random auto-walk scheduling window: min delay (ms). */
const AUTO_WALK_MIN_DELAY = 20_000;

/** Random auto-walk scheduling window: random range added (ms). */
const AUTO_WALK_DELAY_RANGE = 25_000;

// ---------------------------------------------------------------------------
// Idle variant behaviour (yawn, spin, etc.)
// ---------------------------------------------------------------------------

/** Minimum delay before an idle-variant animation (ms). */
const IDLE_VARIANT_MIN_DELAY = 18_000;

/** Random range added on top of IDLE_VARIANT_MIN_DELAY (ms). */
const IDLE_VARIANT_DELAY_RANGE = 17_000;

/** Action names eligible for idle-variant random play. */
const IDLE_VARIANT_ACTIONS = ['idle_yawn', 'idle_spin'];

// ---------------------------------------------------------------------------
// Drag & interaction
// ---------------------------------------------------------------------------

/** Pixel distance threshold before a pointerdown becomes a drag. */
const DRAG_DEAD_ZONE = 3;

/** Maximum drag duration before auto-release (ms). */
const DRAG_TIMEOUT = 30_000;

/** Animation tick interval (ms, ≈60 fps). */
const ANIMATION_TICK_MS = 16;

// ---------------------------------------------------------------------------
// Renderer / visual
// ---------------------------------------------------------------------------

/** Minimum alpha value (0-255) to consider a pixel "visible" for bbox. */
const ALPHA_THRESHOLD = 12;

/** How long the speech bubble stays visible (ms). */
const BUBBLE_DISPLAY_DURATION = 2800;

// ---------------------------------------------------------------------------
// Passive FPS caps per action (renderer)
// ---------------------------------------------------------------------------

/** FPS caps for idle-like actions to save CPU when nothing interesting is happening. */
const PASSIVE_FPS_CAPS = Object.freeze({
  idle: 4
});

module.exports = {
  PetState,
  DEFAULT_CANVAS_SIZE,
  SCALE_MIN,
  SCALE_MAX,
  SCALE_STEP,
  DEFAULT_SCALE,
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
  DRAG_DEAD_ZONE,
  DRAG_TIMEOUT,
  ANIMATION_TICK_MS,
  ALPHA_THRESHOLD,
  BUBBLE_DISPLAY_DURATION,
  PASSIVE_FPS_CAPS
};
