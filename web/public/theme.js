(function () {
  var mode = 'system';
  try {
    var stored = window.localStorage.getItem('ki.theme');
    if (stored) mode = JSON.parse(stored);
  } catch (error) {
    mode = 'system';
  }
  if (mode !== 'system' && mode !== 'light' && mode !== 'dark') mode = 'system';
  var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var effective = mode === 'system' ? (dark ? 'dark' : 'light') : mode;
  document.documentElement.dataset.theme = effective;
  document.documentElement.dataset.themeMode = mode;

  var lang = 'zh';
  try {
    var storedLang = window.localStorage.getItem('ki.lang');
    if (storedLang === 'zh' || storedLang === 'en') {
      lang = storedLang;
    } else {
      var browser = (navigator.languages && navigator.languages[0]) || navigator.language || 'zh';
      lang = browser.toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en';
    }
  } catch (error) {
    lang = 'zh';
  }
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.title = lang === 'zh' ? 'KubeInsight · Kubernetes 控制台' : 'KubeInsight · Kubernetes Console';

  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effective === 'dark' ? '#0a0d12' : '#f4f6fa');
})();
