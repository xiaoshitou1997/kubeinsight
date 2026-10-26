(function () {
  try {
    var stored = window.localStorage.getItem('ki.theme');
    var theme = stored ? JSON.parse(stored) : 'dark';
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  } catch (error) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
