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

const lightTheme = createTheme({
  palette: { mode: 'light', primary: { main: '#f03131' } },
});

const parseDuration = (str) => {
  if (!str) return 0;
  const parts = str.split(':').map(Number);
  return parts.reduce((acc, part) => acc * 60 + part, 0);
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
  const { t } = useTranslation();
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

  const hasAutoLoaded = useRef(false);
  const [youtubeUrl, setYoutubeUrl] = useState(() => {
    return new URLSearchParams(window.location.search).get('v') || '';
  });

  const getYTDuration = () => {
    const durationEl = document.querySelector('.ytp-time-duration');
    return durationEl ? parseDuration(durationEl.innerText) : 0;
  };

  // --- 逻辑恢复 1：上传匹配记录到服务器 ---
  const uploadVideo = (video) => {
    safeSendMessage({ type: 'UPDATE_BEST_MATCH', bvid: video.bvid }, (response) => {
      if (!response || response.error) return;
      const videoData = {
        ...response.video,
        youtubeid: youtubeUrl,
        access: accessToken 
      };
      if (videoData.pic?.startsWith('//')) videoData.pic = videoData.pic.replace('//', 'https://');
      
      fetch(process.env.REACT_APP_API_BASE_URL + '/create/video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { 'Authorization': accessToken }),
        },
        body: JSON.stringify(videoData),
      }).catch(() => {});
    });
  };

  // --- 逻辑恢复 2：统一加载入口 ---
  const loadDanmakuByVideo = (video, shouldUpload = true) => {
    if (!video) return;
    if (shouldUpload) uploadVideo(video);

    safeSendMessage({ type: 'GET_VIDEO_DANMAKU', bvid: video.bvid }, (response) => {
      if (response?.videocid) {
        const danmakuUrl = `https://comment.bilibili.com/${response.videocid}.xml`;
        window.addDanmakuSource?.(danmakuUrl);
      }
    });
  };

  // --- 逻辑恢复 3：搜索功能恢复 ---
  const handleSearchTrigger = (searchInput) => {
    setShowMainControls(false);
    setIsNetworkError(false);
    const ytLen = getYTDuration();

    safeSendMessage({ type: 'SEARCH', query: encodeURI(searchInput) }, (response) => {
      if (!response?.videosResult) {
        setSearchMatchVideos([]);
        return;
      }
      const videoSection = response.videosResult.data.result.find(s => s.result_type === "video");
      if (videoSection) {
        const results = videoSection.data.sort((a, b) => {
          return Math.abs(parseDuration(a.duration) - ytLen) - Math.abs(parseDuration(b.duration) - ytLen);
        });
        results.forEach(v => {
          if (v.pic?.startsWith('//')) v.pic = v.pic.replace('//', 'https://');
          v.title = v.title.replace(/<em class="keyword">([\s\S]*?)<\/em>/g, '$1');
        });
        setSearchMatchVideos(results);
      }
    });
  };

  const refreshMatchedVideos = () => {
    if (!youtubeUrl || isRefreshing) return;
    setIsRefreshing(true);
    setIsNetworkError(false);
    setBestMatchVideos([]);
    setPossibleMatchVideos([]);
    setShowMainControls(true);

    fetch(process.env.REACT_APP_API_BASE_URL + `/api/videos/?youtubeid=${youtubeUrl}`)
      .then(res => res.json())
      .then(data => {
        setBestMatchVideos(data.sort((a, b) => b.numused - a.numused));
      })
      .catch(() => setIsNetworkError(true))
      .finally(() => setIsRefreshing(false));
  };

  useEffect(() => {
    if (youtubeUrl) {
      hasAutoLoaded.current = false;
      setIsNetworkError(false);
      setBestMatchVideos([]);
      setPossibleMatchVideos([]);
      newVideo();

      fetch(process.env.REACT_APP_API_BASE_URL + `/api/videos/?youtubeid=${youtubeUrl}`)
        .then(res => res.json())
        .then(data => {
          const sorted = data.sort((a, b) => b.numused - a.numused);
          setBestMatchVideos(sorted);
          if (sorted.length > 0 && !hasAutoLoaded.current) {
            loadDanmakuByVideo(sorted[0], false); // 自动加载不重报
            hasAutoLoaded.current = true;
          }
        })
        .catch(() => setIsNetworkError(true));

      let checkTitle = setInterval(() => {
        const titleEl = document.querySelector('yt-formatted-string.style-scope.ytd-watch-metadata');
        if (titleEl) {
          clearInterval(checkTitle);
          const ytLen = getYTDuration();
          const cleanTitle = titleEl.innerText.replace(/\[.*?\]|\(.*?\)/g, '').trim();
          safeSendMessage({ type: 'SEARCH', query: cleanTitle }, (response) => {
            if (response?.videosResult) {
              const videoSection = response.videosResult.data.result.find(s => s.result_type === "video");
              if (videoSection) {
                const sorted = videoSection.data.filter(v => v.danmaku !== 0).sort((a, b) => {
                  return Math.abs(parseDuration(a.duration) - ytLen) - Math.abs(parseDuration(b.duration) - ytLen);
                });
                sorted.forEach(v => {
                  if (v.pic?.startsWith('//')) v.pic = v.pic.replace('//', 'https://');
                  v.title = v.title.replace(/<em class="keyword">([\s\S]*?)<\/em>/g, '$1');
                });
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
      DanmuBtn.src = LogoIcon;
      DanmuBtn.className = "ytp-button DanmuControl";
      DanmuBtn.id = "DanmakuControlBtn";
      const checkExist = setInterval(function() {
        const youtubeRightControls = document.getElementsByClassName("ytp-right-controls")[0];
        if (youtubeRightControls) {
          clearInterval(checkExist);
          const DanmuPanel = appendDanmakuControl(youtubeRightControls, DanmuBtn);
          const parentWrapper = DanmuPanel.parentElement;
          DanmuBtn.addEventListener("click", () => {
            const res = window.toggleDanmakuVisibility?.();
            res ? DanmuBtn.classList.remove("makeGray") : DanmuBtn.classList.add("makeGray");
          });
          parentWrapper.addEventListener("mouseenter", () => { DanmuPanel.style.display = "block"; });
          parentWrapper.addEventListener("mouseleave", () => { DanmuPanel.style.display = "none"; });
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
      <div style={{ backgroundColor: '#ffffff', color: '#0f0f0f' }}>
        <Button 
          variant="contained" onClick={handleLogoClick} 
          style={{ width:'100%', height:'42px', fontSize:'14px', fontWeight:'bold', borderRadius:'21px', backgroundColor:'#f2f2f2', color: '#0f0f0f', display: isPopupOpen ? 'none' : 'block', border:'1px solid #dcdcdc', boxShadow: 'none', textTransform: 'none' }}
        >
          ▼ 展开弹幕选择面板 ▼
        </Button>

        <div id="DanMuPopup" style={{ display: isPopupOpen ? 'flex' : 'none', flexDirection: 'column', position: 'relative', height:'560px', overflow: 'hidden' }}>
          <IconButton onClick={handleCloseIconClick} style={{position: 'absolute', top: 5, right: 5, zIndex: 10}}><CloseRoundedIcon/></IconButton>
          
          <div style={{ paddingTop: '40px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '10px' }}>
            <div style={{ flex: 1 }}><CustomizedInputBase onSearchTrigger={handleSearchTrigger}/></div>
            <button onClick={refreshMatchedVideos} disabled={isRefreshing} style={{ background: 'none', border: 'none', cursor: isRefreshing ? 'not-allowed' : 'pointer', padding: '6px', opacity: isRefreshing ? 0.4 : 0.65 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}>
                <polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36"></path>
              </svg>
            </button>
          </div>
          
          <Modal show={isModalOpen} onClose={() => setIsModalOpen(false)} onLoadDanmakus={() => { loadDanmakuByVideo(selectedVideo, true); setIsModalOpen(false); }} pic={selectedVideo?.pic} title={selectedVideo?.title} />
          
          <div style={{ padding: '10px', overflowY: 'auto', flexGrow: 1, scrollbarWidth: 'thin' }}>
             {isNetworkError && <p style={{color:'red', fontSize:'12px'}}>网络连接失败，请检查代理</p>}
             <h1 style={{fontSize:'14px', borderBottom:'1px solid #eee', color:'#0f0f0f', paddingBottom:'5px', marginBottom:'10px'}}>
               {showMainControls ? '最佳匹配 (由其他用户关联)' : '搜索结果'}
             </h1>
             {(showMainControls ? bestMatchVideos : searchMatchVideos).map((v, i) => (
                <VideoBox key={i} {...v} onClick={() => { setSelectedVideo(v); setIsModalOpen(true); }} />
             ))}
             {showMainControls && (
                <>
                  <h1 style={{fontSize:'14px', marginTop:'20px', borderBottom:'1px solid #eee', color:'#0f0f0f', paddingBottom:'5px', marginBottom:'10px'}}>可能匹配 (基于时长和标题)</h1>
                  {possibleMatchVideos.map((v, i) => <VideoBox key={i} {...v} onClick={() => { setSelectedVideo(v); setIsModalOpen(true); }} />)}
                </>
             )}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </ThemeProvider>
  );
}

export default App;