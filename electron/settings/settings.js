const packName = document.getElementById('pack-name');
const scaleValue = document.getElementById('scale-value');
const slider = document.getElementById('scale-slider');
const resetButton = document.getElementById('reset-button');

let currentState = null;
let applying = false;

function applyState(state) {
  currentState = state;
  applying = true;
  packName.textContent = state.displayName || 'Desktop Pet';
  slider.min = String(Math.round(state.min * 100));
  slider.max = String(Math.round(state.max * 100));
  slider.step = String(Math.round(state.step * 100));
  slider.value = String(Math.round(state.scale * 100));
  scaleValue.textContent = `${Math.round(state.scale * 100)}%`;
  applying = false;
}

slider.addEventListener('input', async () => {
  if (applying) return;
  const scale = Number(slider.value) / 100;
  scaleValue.textContent = `${Math.round(scale * 100)}%`;
  const state = await window.desktopPet.setPetScale(scale);
  applyState(state);
});

resetButton.addEventListener('click', async () => {
  const state = await window.desktopPet.resetPetScale();
  applyState(state);
});

window.desktopPet.onSettingsState(applyState);

window.desktopPet.getSettingsState().then(applyState);
