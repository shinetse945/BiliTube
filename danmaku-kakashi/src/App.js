import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next';
import { useAccessToken } from './AccessTokenContext';
import './content/App.css';
import * as React from 'react';
import Button from '@mui/material/Button';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import IconButton from '@mui/material/IconButton';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CustomizedInputBase from './content/searchBar.js';
import Modal from './content/Modal.js';
import VideoBox from './content/VideoBox.js';
import appendDanmakuControl from './content/DanmakuPanel.js';
import Draggable from 'react-draggable';

const lightTheme = createTheme({
  palette: { mode: 'light', primary: { main: '#f03131' } },
});

const parseDuration = (str) => {
  if (!str) return 0;
  const parts = str.split(':').map(Number);
  return parts.reduce((acc, part) => acc * 60 + part, 0);
};

const INITIAL_DICT = [];

const extractFeatureString = (title, dictArray) => {
  if (!title) return '';
  let text = title;
  if (dictArray && dictArray.length > 0) {
    dictArray.forEach(({ kr, zh }) => {
      if (kr && zh) text = text.split(kr).join(` ${zh} `);
    });
  }
  text = text.replace(/\[.*?\]|\(.*?\)|\{.*?\}/g, (match) => {
    if (/[\u4e00-\u9fa5a-zA-Z]/.test(match)) return match.replace(/[\[\]\(\)\{\}]/g, ' ');
    return ' ';
  });
  text = text.replace(/[\u3130-\u318F\uAC00-\uD7AF\u3040-\u309F\u30A0-\u30FF]/g, ' ');
  text = text.replace(/[|｜,，\-_\~～!！?？:：'”"‘♪\*\.˚&\+]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > 1 ? text : title.replace(/\[.*?\]|\(.*?\)/g, '').trim();
};

const safeSendMessage = (params, callback) => {
  try {
    if (chrome?.runtime?.id) {
      chrome.runtime.sendMessage(params, (response) => {
        if (chrome.runtime.lastError) return;
        if (callback) callback(response);
      });
    }
  } catch (e) {}
};

function App({ initOpen }) {
  const { accessToken } = useAccessToken();
  const LogoIcon = chrome.runtime.getURL("icons/logoicon.png");

  const [searchMatchVideos, setSearchMatchVideos] = useState([]);
  const [showMainControls, setShowMainControls] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [bestMatchVideos, setBestMatchVideos] = useState([]);
  const [possibleMatchVideos, setPossibleMatchVideos] = useState([]);
  const [isPopupOpen, setIsPopupOpen] = useState(initOpen);
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 词典编辑器状态
  const [showDictSettings, setShowDictSettings] = useState(false);
  const [dictList, setDictList] = useState(INITIAL_DICT);
  const dictListRef = useRef(INITIAL_DICT);
  const draggableNodeRef = useRef(null);

  const hasAutoLoaded = useRef(false);
  const [youtubeUrl, setYoutubeUrl] = useState(() => {
    return new URLSearchParams(window.location.search).get('v') || '';
  });

  const getYTDuration = () => {
    const durationEl = document.querySelector('.ytp-time-duration');
    return durationEl ? parseDuration(durationEl.innerText) : 0;
  };

  const getYTTitle = () => {
    const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') 
                 || document.querySelector('#title h1 yt-formatted-string') 
                 || document.querySelector('yt-formatted-string.style-scope.ytd-watch-metadata');
    return titleEl ? titleEl.innerText : '';
  };

  useEffect(() => {
    chrome.storage.sync.get(['customKpopDict'], (result) => {
      if (result.customKpopDict && Array.isArray(result.customKpopDict)) {
        setDictList(result.customKpopDict);
        dictListRef.current = result.customKpopDict;
      }
    });
  }, []);

  const handleDictChange = (index, field, value) => {
    const newList = [...dictList];
    newList[index][field] = value;
    setDictList(newList);
  };

  const addDictRow = () => setDictList([{ kr: '', zh: '' }, ...dictList]);
  const removeDictRow = (index) => setDictList(dictList.filter((_, i) => i !== index));

  const saveDict = () => {
    const cleaned = dictList.filter(item => item.kr.trim() !== '' && item.zh.trim() !== '');
    setDictList(cleaned);
    dictListRef.current = cleaned;
    chrome.storage.sync.set({ customKpopDict: cleaned }, () => setShowDictSettings(false));
  };

  const clearDict = () => {
    if (window.confirm('确定要清空所有自定义替换词吗？')) {
      setDictList(INITIAL_DICT);
      dictListRef.current = INITIAL_DICT;
      chrome.storage.sync.remove(['customKpopDict'], () => setShowDictSettings(false));
    }
  };

  const uploadVideo = (video) => {
    const targetBvid = video.bvid || video.id;
    safeSendMessage({ type: 'UPDATE_BEST_MATCH', bvid: targetBvid }, (response) => {
      if (!response || response.error) return;
      const videoData = { ...response.video, youtubeid: youtubeUrl, access: accessToken };
      if (videoData.pic?.startsWith('//')) videoData.pic = `https:${videoData.pic}`;
      fetch(process.env.REACT_APP_API_BASE_URL + '/create/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(accessToken && { 'Authorization': accessToken }) },
        body: JSON.stringify(videoData),
      }).catch(() => {});
    });
  };

  const loadDanmakuByVideo = (video, shouldUpload = true) => {
    if (!video) return;
    const targetBvid = video.bvid || video.id;
    if (shouldUpload) uploadVideo(video);
    safeSendMessage({ type: 'GET_VIDEO_DANMAKU', bvid: targetBvid }, (response) => {
      if (response?.videocid) {
        const danmakuUrl = `https://comment.bilibili.com/${response.videocid}.xml`;
        window.addDanmakuSource?.(danmakuUrl);
      }
    });
  };

  const handleSearchTrigger = (searchInput) => {
    setShowMainControls(false);
    setIsNetworkError(false);
    const queryText = extractFeatureString(searchInput, dictListRef.current);
    safeSendMessage({ type: 'SEARCH', query: queryText }, (response) => {
      if (!response?.videosResult?.data?.result) { setSearchMatchVideos([]); return; }
      const videoSection = response.videosResult.data.result.find(s => s.result_type === "video");
      if (videoSection) {
        const results = videoSection.data.sort((a, b) => Math.abs(parseDuration(a.duration) - getYTDuration()) - Math.abs(parseDuration(b.duration) - getYTDuration()));
        results.forEach(v => { if (v.pic?.startsWith('//')) v.pic = `https:${v.pic}`; v.title = v.title.replace(/<em class="keyword">([\s\S]*?)<\/em>/g, '$1'); });
        setSearchMatchVideos(results);
      }
    });
  };

  const refreshMatchedVideos = () => {
    if (!youtubeUrl || isRefreshing) return;
    setIsRefreshing(true);
    setBestMatchVideos([]); setPossibleMatchVideos([]);
    setShowMainControls(true);
    fetch(process.env.REACT_APP_API_BASE_URL + `/api/videos/?youtubeid=${youtubeUrl}`)
      .then(res => res.json())
      .then(data => {
        const sorted = data.sort((a, b) => b.numused - a.numused);
        setBestMatchVideos(sorted);
        if (sorted.length > 0 && !hasAutoLoaded.current) { loadDanmakuByVideo(sorted[0], false); hasAutoLoaded.current = true; }
      }).catch(() => setIsNetworkError(true));

    let checkTitle = setInterval(() => {
      const rawTitle = getYTTitle();
      if (rawTitle) {
        clearInterval(checkTitle);
        const queryText = extractFeatureString(rawTitle, dictListRef.current);
        safeSendMessage({ type: 'SEARCH', query: queryText }, (response) => {
          const resData = response?.videosResult?.data?.result;
          if (resData) {
            const videoSection = resData.find(s => s.result_type === "video");
            if (videoSection) {
              const sorted = videoSection.data.filter(v => v.danmaku !== 0).sort((a, b) => Math.abs(parseDuration(a.duration) - getYTDuration()) - Math.abs(parseDuration(b.duration) - getYTDuration()));
              sorted.forEach(v => { if (v.pic?.startsWith('//')) v.pic = `https:${v.pic}`; v.title = v.title.replace(/<em class="keyword">([\s\S]*?)<\/em>/g, '$1'); });
              setPossibleMatchVideos(sorted);
            }
          }
        });
      }
    }, 1500);
    setTimeout(() => { clearInterval(checkTitle); setIsRefreshing(false); }, 10000);
  };

  useEffect(() => {
    const handleUrlChange = () => {
      const currentVid = new URLSearchParams(window.location.search).get('v') || '';
      if (currentVid !== youtubeUrl) setYoutubeUrl(currentVid);
    };
    let lastUrl = location.href; 
    new MutationObserver(() => { if (location.href !== lastUrl) { lastUrl = location.href; handleUrlChange(); } }).observe(document, { subtree: true, childList: true });
    document.addEventListener('yt-page-data-updated', handleUrlChange);
    return () => document.removeEventListener('yt-page-data-updated', handleUrlChange);
  }, [youtubeUrl]);

  useEffect(() => {
    if (youtubeUrl) {
      hasAutoLoaded.current = false; setIsNetworkError(false); setBestMatchVideos([]); setPossibleMatchVideos([]); newVideo();
      fetch(process.env.REACT_APP_API_BASE_URL + `/api/videos/?youtubeid=${youtubeUrl}`)
        .then(res => res.json()).then(data => {
          const sorted = data.sort((a, b) => b.numused - a.numused);
          setBestMatchVideos(sorted);
          if (sorted.length > 0 && !hasAutoLoaded.current) { loadDanmakuByVideo(sorted[0], false); hasAutoLoaded.current = true; }
        }).catch(() => setIsNetworkError(true));

      let checkTitle = setInterval(() => {
        const rawTitle = getYTTitle();
        if (rawTitle) {
          clearInterval(checkTitle);
          const queryText = extractFeatureString(rawTitle, dictListRef.current);
          safeSendMessage({ type: 'SEARCH', query: queryText }, (response) => {
            const resData = response?.videosResult?.data?.result;
            if (resData) {
              const videoSection = resData.find(s => s.result_type === "video");
              if (videoSection) {
                const sorted = videoSection.data.filter(v => v.danmaku !== 0).sort((a, b) => Math.abs(parseDuration(a.duration) - getYTDuration()) - Math.abs(parseDuration(b.duration) - getYTDuration()));
                sorted.forEach(v => { if (v.pic?.startsWith('//')) v.pic = `https:${v.pic}`; v.title = v.title.replace(/<em class="keyword">([\s\S]*?)<\/em>/g, '$1'); });
                setPossibleMatchVideos(sorted);
              }
            }
          });
        }
      }, 1500);
      return () => clearInterval(checkTitle);
    }
  }, [youtubeUrl]);

  const newVideo = async () => {
    if (!document.getElementsByClassName("DanmuControl")[0]) {
      const DanmuBtn = document.createElement("img");
      DanmuBtn.src = LogoIcon; DanmuBtn.className = "ytp-button DanmuControl";
      const checkExist = setInterval(function() {
        const youtubeRightControls = document.getElementsByClassName("ytp-right-controls")[0];
        if (youtubeRightControls) {
          clearInterval(checkExist);
          const DanmuPanel = appendDanmakuControl(youtubeRightControls, DanmuBtn);
          DanmuBtn.addEventListener("click", () => {
            const res = window.toggleDanmakuVisibility?.();
            res ? DanmuBtn.classList.remove("makeGray") : DanmuBtn.classList.add("makeGray");
          });
          DanmuPanel.parentElement.addEventListener("mouseenter", () => { DanmuPanel.style.display = "block"; });
          DanmuPanel.parentElement.addEventListener("mouseleave", () => { DanmuPanel.style.display = "none"; });
        }
      }, 400);
    }
  };

  const handleCloseIconClick = () => {
    const root = document.getElementById('danmaku-kakashi-root');
    if (root) root.style.height = '42px';
    setTimeout(() => setIsPopupOpen(false), 150);
    chrome.storage.sync.set({MainPanel: false});
  };

  const handleLogoClick = () => {
    const root = document.getElementById('danmaku-kakashi-root');
    setIsPopupOpen(true);
    if (root) root.style.height = '600px';
    chrome.storage.sync.set({MainPanel: true});
  };

  return (
    <ThemeProvider theme={lightTheme}>
      <div style={{ position: 'relative', fontFamily: '"Roboto", Arial, sans-serif' }}>
        
        {/* 面板展开按钮 */}
        <Button variant="contained" onClick={handleLogoClick} style={{ width:'100%', height:'42px', fontSize:'14px', borderRadius:'21px', backgroundColor:'#f2f2f2', color: '#0f0f0f', display: isPopupOpen ? 'none' : 'block', boxShadow: 'none', textTransform: 'none' }}>
          ▼ 展开弹幕关联面板 ▼
        </Button>

        {/* 词典编辑器 - 悬浮模式 (修复拖拽延迟 & 视觉隐藏把手) */}
        {showDictSettings && (
          <Draggable 
            nodeRef={draggableNodeRef} 
            handle=".drag-handle" 
            enableUserSelectHack={false}
          >
            <div 
              ref={draggableNodeRef}
              style={{ 
                position: 'fixed', top: '100px', right: '40px', width: '560px', 
                backgroundColor: '#ffffff', borderRadius: '12px', zIndex: 9999, 
                boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid #eeeeee',
                display: 'flex', flexDirection: 'column', transition: 'none' 
              }}
            >
              {/* 隐藏式把手：透明区域，仅有关闭按钮 */}
              <div className="drag-handle" style={{ padding: '8px 12px', cursor: 'grab', display: 'flex', justifyContent: 'flex-end' }}>
                <IconButton onClick={() => setShowDictSettings(false)} size="small">
                  <CloseRoundedIcon fontSize="small" style={{ color: '#909090' }}/>
                </IconButton>
              </div>

              <div style={{ padding: '0 20px 20px 20px' }}>
                <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f0f0f', marginBottom: '16px' }}>词典映射管理</div>
                
                <div style={{ overflowY: 'auto', maxHeight: '320px', paddingRight: '8px', scrollbarWidth: 'thin' }}>
                  {dictList.map((item, index) => (
                    <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                      <input type="text" placeholder="原词" value={item.kr} onChange={(e) => handleDictChange(index, 'kr', e.target.value)} style={{ flex: 1, padding: '8px 12px', border: '1px solid #e5e5e5', borderRadius: '4px', fontSize: '13px', outline: 'none' }} />
                      <span style={{ color: '#909090' }}>→</span>
                      <input type="text" placeholder="中文替换" value={item.zh} onChange={(e) => handleDictChange(index, 'zh', e.target.value)} style={{ flex: 1, padding: '8px 12px', border: '1px solid #e5e5e5', borderRadius: '4px', fontSize: '13px', outline: 'none' }} />
                      <button onClick={() => removeDictRow(index)} style={{ background: 'none', border: 'none', color: '#909090', cursor: 'pointer', fontSize: '20px' }}>×</button>
                    </div>
                  ))}
                </div>

                <button onClick={addDictRow} style={{ width: '100%', padding: '8px', backgroundColor: '#fff', border: '1px dashed #3f3e3e', borderRadius: '8px', color: '#606060', fontSize: '12px', margin: '16px 0', cursor: 'pointer' }}>
                  + 添加新条目
                </button>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={clearDict} style={{ padding: '10px 16px', backgroundColor: '#f2f2f2', border: 'none', borderRadius: '18px', fontSize: '13px', color: '#0f0f0f', cursor: 'pointer' }}>清空全部</button>
                  <button onClick={saveDict} style={{ flex: 1, padding: '10px', backgroundColor: '#0f0f0f', border: 'none', borderRadius: '18px', fontSize: '13px', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>保存并应用</button>
                </div>
              </div>
            </div>
          </Draggable>
        )}

        {/* 主控制面板 */}
        <div id="DanMuPopup" style={{ display: isPopupOpen ? 'flex' : 'none', flexDirection: 'column', height:'560px', overflow: 'hidden', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e5e5' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px', borderBottom: '1px solid #f2f2f2', gap: '8px' }}>
            <div style={{ flex: 1 }}><CustomizedInputBase onSearchTrigger={handleSearchTrigger}/></div>
            
            <button onClick={() => setShowDictSettings(!showDictSettings)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#606060" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            </button>

            <button onClick={refreshMatchedVideos} disabled={isRefreshing} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#606060" strokeWidth="2" style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36"></path></svg>
            </button>

            <IconButton onClick={handleCloseIconClick} size="small"><CloseRoundedIcon fontSize="small"/></IconButton>
          </div>

          <div style={{ padding: '10px', overflowY: 'auto', flexGrow: 1 }}>
             {isNetworkError && <p style={{color:'#f03131', fontSize:'12px', textAlign:'center'}}>获取数据失败，请检查网络连接</p>}
             <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f0f0f', margin: '8px 0 12px 4px' }}>
               {showMainControls ? '最佳匹配视频' : '搜索结果'}
             </div>
             {(showMainControls ? bestMatchVideos : searchMatchVideos).map((v, i) => (
                <VideoBox key={i} {...v} onClick={() => { setSelectedVideo(v); setIsModalOpen(true); }} />
             ))}
             {showMainControls && (
                <>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f0f0f', margin: '24px 0 12px 4px', borderTop: '1px solid #f2f2f2', paddingTop: '16px' }}>可能匹配的视频</div>
                  {possibleMatchVideos.map((v, i) => <VideoBox key={i} {...v} onClick={() => { setSelectedVideo(v); setIsModalOpen(true); }} />)}
                </>
             )}
          </div>
        </div>

        <Modal show={isModalOpen} onClose={() => setIsModalOpen(false)} onLoadDanmakus={() => { loadDanmakuByVideo(selectedVideo, true); setIsModalOpen(false); }} pic={selectedVideo?.pic} title={selectedVideo?.title} />
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </ThemeProvider>
  );
}

export default App;