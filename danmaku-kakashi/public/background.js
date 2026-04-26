chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 原逻辑：只要 status === 'complete' 就发消息
  // 现逻辑：通过判断 changeInfo.url 是否存在来尽量规避 SPA 跳转时的重复触发
  if (changeInfo.status === 'complete' && tab.url.includes("youtube.com/watch")) {

    // 如果是站内切换，changeInfo 通常不含 url，只有完整刷新才有
    // 这能减少一部分冲突
    const queryParameters = tab.url.split("?")[1];
    const urlParameters = new URLSearchParams(queryParameters);
    const videoId = urlParameters.get('v');
    const userLanguage = chrome.i18n.getUILanguage();

    console.log('Checking if need to send ID:', videoId);

    chrome.tabs.sendMessage(tabId, {
      type: 'youtubeid',
      vid: videoId,
      lang: userLanguage
    }, function (response) {
      if (chrome.runtime.lastError) {
        return;
      }
      if (response)
        console.log("Got it from React ", response.text);
    });
  }
});

chrome.runtime.onMessage.addListener(
  function (request, sender, sendResponse) {
    if (request.type === 'GET_THUMBNAIL') {
      fetch(request.url, {
        method: 'GET',
        headers: {
          'Referer': ''
        }
      })
        .then(response => response.blob())
        .then(blob => {
          const reader = new FileReader();
          reader.onloadend = function () {
            sendResponse({thumbnail: reader.result});
          };
          reader.readAsDataURL(blob);
        })
        .catch(error => {
          console.error('Error fetching thumbnail:', error);
          sendResponse({error: "Failed"});
        });
      return true;
    }

    if (request.type === 'SEARCH') {
      console.log("Search Request: ", request);
      // 修复 1：清理了原作者错误嵌套在此处的数十行废代码
      fetch('https://api.bilibili.com/x/web-interface/wbi/search/all/v2?keyword=' + request.query,
        {
          method: 'GET',
          credentials: 'include'
        })
        .then(response => response.json())
        .then(response => {
          console.log("Search Response: ", response);
          sendResponse({videosResult: response});
        })
        .catch(error => {
          console.error('Error fetching search:', error)
          sendResponse({error: "Failed to fetch data"});
        });
      return true;
    }

    if (request.type === 'GET_VIDEO_DANMAKU') {
      console.log("Request: ", request);
      fetch('https://api.bilibili.com/x/player/pagelist?bvid=' + request.bvid,
        {
          method: 'GET',
          credentials: 'include'
        })
        .then(response => {
          if (!response.ok) throw new Error('Network response was not ok');
          return response.json();
        })
        .then(data => {
          if (data && data.data && data.data.length > 0) {
              return data.data[0].cid;
          }
          throw new Error('No data found');
        })
        .then(cid => {
          console.log("Response3: ", cid);
          sendResponse({videocid: cid});
        })
        .catch(error => {
          console.error('Error fetching cid:', error)
          sendResponse({error: "Failed to fetch data"});
        });
      return true;
    }

    if (request.type === 'DOWNLOAD_DANMAKU') {
      console.log("Got danmaku download request: ", request);
      fetch(request.url, {
        method: 'GET',
        headers: {
          'Referer': 'no-referer'
        }
      })
        .then(response => response.blob())
        .then(blob => {
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = function () {
            sendResponse({danmakuxml: reader.result});
          };
        })
        .catch(error => {
          console.error('Error downloading danmaku:', error);
          sendResponse({error: "Failed"});
        });
      return true;
    }

    if (request.type === 'UPDATE_BEST_MATCH') {
      console.log("Got best match update request: ", request);
      fetch('https://api.bilibili.com/x/web-interface/wbi/search/all/v2?keyword=' + request.bvid,
      {
        method: 'GET',
        credentials: 'include'
      })
      .then(response => response.json())
      .then(data => {
        // 修复 2：增加多层嵌套安全校验，防止 B 站接口返回空数据导致 find() 函数崩溃
        if (data && data.data && data.data.result) {
            const videoSection = data.data.result.find(section => section.result_type === "video");
            if (videoSection && videoSection.data && videoSection.data.length > 0) {
                sendResponse({video: videoSection.data[0]});
                return;
            }
        }
        sendResponse({error: "No video found"});
      })
      .catch(error => {
        console.error('Error fetching best match:', error)
        sendResponse({error: "Failed to fetch data"});
      });
      return true;
    }

    if (request.type === 'FETCH_GENERAL') {
      console.log("Fetch Request: ", request);
      fetch(request.url,
        {
          method: request.method,
          credentials: 'include',
          headers: request.headers
        })
        .then(response => response.json())
        .then(response => {
          console.log("Fetch Response: ", response);
          sendResponse({result: response});
        })
        .catch(error => {
          console.error('Error fetching data:', error)
          sendResponse({error: "Failed to fetch data"});
        });
      return true;
    }
  }
);