browser.action.onClicked.addListener(() => {
  browser.tabs.create({url: browser.runtime.getURL('index.html')});
});
