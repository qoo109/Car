(() => {
  'use strict';

  const notice = document.getElementById('notice');
  const weatherButton = () => document.getElementById('v85WeatherButton');

  function setSunnyStart() {
    try {
      localStorage.setItem('neon-toy-v85-weather', 'clear');
      window.NeonToyV85?.setWeather?.('clear');
      document.documentElement.classList.remove('v85-weather-rain', 'v85-weather-night');
      const button = weatherButton();
      if (button) {
        button.textContent = '天候：晴朗';
        button.setAttribute('aria-pressed', 'false');
      }
    } catch (_) {}
  }

  // Every time the setup screen opens, return it to a bright, clear presentation.
  setSunnyStart();
  requestAnimationFrame(setSunnyStart);

  if (notice) {
    const observer = new MutationObserver(() => {
      if (!notice.classList.contains('hidden')) setSunnyStart();
    });
    observer.observe(notice, { attributes: true, attributeFilter: ['class'] });
  }

  window.NeonToySunnyStart = { reset: setSunnyStart, version: '8.5.1' };
})();
