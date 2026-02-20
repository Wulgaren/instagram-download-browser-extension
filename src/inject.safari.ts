(function() {
   const SAFARI_INSTAGRAM_XHR_MSG_INJECT = 'safari-ig-dl-xhr-msg';

   const safariInjectScript = document.createElement('script');
   safariInjectScript.setAttribute('type', 'text/javascript');
   safariInjectScript.setAttribute('src', chrome.runtime.getURL('xhr.js'));
   safariInjectScript.onload = () => {
      safariInjectScript.remove();
   };
   (document.head || document.documentElement).appendChild(safariInjectScript);

   window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.type !== SAFARI_INSTAGRAM_XHR_MSG_INJECT) return;

      const { payload } = event.data;
      if (payload.msgType) {
         chrome.runtime.sendMessage({
            type: payload.msgType,
            data: payload.data,
         });
      } else {
         chrome.runtime.sendMessage({
            api: payload.api,
            data: payload.data,
         });
      }
   });
})();
