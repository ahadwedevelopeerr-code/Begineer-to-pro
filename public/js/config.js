(() => {
  const localHosts = new Set(['localhost', '127.0.0.1']);
  const useLiveServer = localHosts.has(window.location.hostname) && window.location.port === '5500';
  const apiOrigin = useLiveServer
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : window.location.origin;

  const apiUrl = path => `${apiOrigin}/api/${String(path).replace(/^\/+/, '')}`;
  window.CodePath = {
    apiUrl,
    fetch(path, options = {}) {
      return window.fetch(apiUrl(path), { ...options, credentials: 'include' });
    }
  };
})();