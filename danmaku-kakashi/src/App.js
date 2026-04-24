import {useState, useEffect} from 'react'
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
// import UserInfo from './content/UserInfo.js'; // 已移除 UserInfo 引用
import appendDanmakuControl from './content/DanmakuPanel.js';

const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#f03131',
    },
    background: {
      default: '#ffffff',
      paper: '#f8f8f8',
    },
    text: {
      primary: '#0f0f0f',
      secondary: '#606060',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: '18px',
        },
      },
    },
  },
});

function App() {
  const { t, i18n } = useTranslation();
  const [lang, setLang] = React.useState(i18n.language);
  const { accessToken, setAccessToken } = useAccessToken();

  // const Logo = chrome.runtime.getURL("icons/logo.png"); // Logo 变量已不再需要
  const LogoIcon = chrome.runtime.getURL("icons/logoicon.png");

  const [searchMatchVideos, setSearchMatchVideos] = useState([]);
  const [showMainControls, setShowMainControls] = useState(true);
  const [searchError, setSearchError] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [bestMatchVideos, setBestMatchVideos] = useState([]);
  const [possibleMatchVideos, setPossibleMatchVideos] = useState([]);
  const [isPopupOpen, setIsPopupOpen] = useState(true);

  const [youtubeUrl, setYoutubeUrl] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v') || '';
  });

  const handleSearchTrigger = (searchInput) => {
    setShowMainControls(false);
    chrome.runtime.sendMessage({ type: 'SEARCH', query: encodeURI(searchInput) }, (response) => {
      if (response.error) {
        if (response.error === 'Not logged in') {
          setSearchError(true);
        }
        return;
      }
      const searchMatch = response.videosResult.data.result.find(section => section.result_type === "video").data;

      searchMatch.forEach((video) => {
        if (video.pic.startsWith('//')) video.pic = video.pic.replace('//', 'https://');
        video.title = video.title.replace(/<em class="keyword">([\s\S]*?)<\/em>/g, '$1');
      });
      setSearchMatchVideos(searchMatch);
      setSearchError(false);
    });
  };

  const showVideoBox = () => setShowMainControls(true);

  const handleLoadDanmakusClick = () => {
    if (selectedVideo) {
      uploadVideo(selectedVideo);
      chrome.runtime.sendMessage({ type: 'GET_VIDEO_DANMAKU', bvid: selectedVideo.bvid }, (response) => {
        if (response.error) return;
        const cid = response.videocid;
        const danmakuUrl = `https://comment.bilibili.com/${cid}.xml`;
        window.addDanmakuSource(danmakuUrl);
      });
      setIsModalOpen(false);
    }
  };

  const uploadVideo = (video) => {
    let cur_video = video;
    const updateVideoData = new Promise((resolve, reject) => {
      if ('cover' in video) {
        resolve({ ...cur_video, youtubeid: youtubeUrl });
      } else {
        chrome.runtime.sendMessage({ type: 'UPDATE_BEST_MATCH', bvid: video.bvid }, (response) => {
          if (response.error) {
            reject(response.error);
            return;
          }
          cur_video = response;
          if (cur_video.video.pic.startsWith('//')) cur_video.video.pic = cur_video.video.pic.replace('//', 'https://');
          resolve({ ...cur_video.video, youtubeid: youtubeUrl, access: accessToken });
        });
      }
    });

    updateVideoData.then(VideoData => {
      fetch(process.env.REACT_APP_API_BASE_URL + '/create/video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && {'Authorization': accessToken}),
      },
        body: JSON.stringify(VideoData),
      })
      .then(response => response.json())
      .catch((error) => console.error('Error:', error));
    });
  }

  const handleVideoClick = video => {
    setSelectedVideo(video);
    setIsModalOpen(true);
  };

  useEffect(() => {
    let intervalId = null;
    if (youtubeUrl){
      const url = process.env.REACT_APP_API_BASE_URL + `/api/videos/?youtubeid=${youtubeUrl}`;
      newVideo();
      fetch(url)
        .then(response => response.json())
        .then(data => {
          data.sort((a, b) => b.numused - a.numused);
          setBestMatchVideos(data);
        })
        .catch(error => console.error('Error fetching best match:', error));

      intervalId = setInterval(() => {
        const titleElement = document.querySelector('yt-formatted-string.style-scope.ytd-watch-metadata');
        if (titleElement) {
          const title = titleElement.innerText || titleElement.textContent;
          clearInterval(intervalId);
          chrome.runtime.sendMessage({ type: 'SEARCH', query: title}, (response) => {
            if (response && response.videosResult) {
              const videoSection = response.videosResult.data.result.find(section => section.result_type === "video");
              if (videoSection) {
                const searchMatch = videoSection.data.filter(video => video.danmaku !== 0);
                searchMatch.forEach((video) => {
                  if (video.pic.startsWith('//')) video.pic = video.pic.replace('//', 'https://');
                  video.title = video.title.replace(/<em class="keyword">([\s\S]*?)<\/em>/g, '$1');
                });
                setPossibleMatchVideos(searchMatch);
              }
            }
          });
        }
      }, 1000);
    }

    const handleNewUrl = (message, sender, sendResponse) => {
      if (message.type === 'youtubeid') {
          let lang = message.lang.startsWith('zh') ? 'zh' : 'en';
          if (i18n.language !== lang) {
            i18n.changeLanguage(lang);
            setLang(lang);
          }
          sendResponse({text: 'Language updated'});
          return true;
      }
    };

    chrome.runtime.onMessage.addListener(handleNewUrl);
    chrome.storage.sync.get(['MainPanel'], function(result) {
      if (result.MainPanel === undefined) {
        chrome.storage.sync.set({MainPanel: true});
      } else if (result.MainPanel === false) {
        handleCloseIconClick();
      }
    });

    return () => {
        if (intervalId) clearInterval(intervalId);
        chrome.runtime.onMessage.removeListener(handleNewUrl);
    };
  }, [youtubeUrl]);

  const newVideo = async() => {
    const DanmuControl = document.getElementsByClassName("DanmuControl")[0];
    if (!DanmuControl) {
      const DanmuBtn = document.createElement("img");
      DanmuBtn.src = LogoIcon;
      DanmuBtn.className = "ytp-button DanmuControl";
      DanmuBtn.id = "DanmakuControlBtn";
      DanmuBtn.style.cursor = "pointer";
      const checkExist = setInterval(function() {
        const youtubeRightControls = document.getElementsByClassName("ytp-right-controls")[0];
        if (youtubeRightControls) {
          clearInterval(checkExist);
          const DanmuPanel = appendDanmakuControl(youtubeRightControls, DanmuBtn);
          DanmuBtn.addEventListener("click", OpenDanmakuControlHandler);
          DanmuBtn.addEventListener("mouseenter", () => { DanmuPanel.style.display = "block"; });
          DanmuBtn.addEventListener("mouseleave", () => { DanmuPanel.style.display = "none"; });
        }
      }, 100);
    }
  };

  const OpenDanmakuControlHandler = async() => {
    var result = window.toggleDanmakuVisibility();
    if (result) document.getElementById("DanmakuControlBtn").classList.remove("makeGray");
    else document.getElementById("DanmakuControlBtn").classList.add("makeGray");
  }

  const handleCloseIconClick = () => {
    var rootElement = document.getElementById('danmaku-kakashi-root');
    if (rootElement) {
        rootElement.style.height = '40px';
        rootElement.style.maxHeight = '40px';
        rootElement.style.boxShadow = 'none';
    }
    setIsPopupOpen(false);
    chrome.storage.sync.set({MainPanel: false});
  };

  const handleLogoClick = () => {
    var rootElement = document.getElementById('danmaku-kakashi-root');
    setIsPopupOpen(true);
    if (rootElement) {
        rootElement.style.height = '600px';
        rootElement.style.maxHeight = '600px';
        rootElement.style.boxShadow = '0 4px 15px rgba(0,0,0,0.1)';
    }
    chrome.storage.sync.set({MainPanel: true});
  };

  return (
    <ThemeProvider theme={lightTheme}>
    <div style={{ backgroundColor: '#ffffff', color: '#0f0f0f' }}>
      <Button variant="contained" onClick={handleLogoClick}
        style={{width:'100%', borderRadius:'18px', backgroundColor:'#f2f2f2', color: '#0f0f0f',
        border: '1px solid #dcdcdc', display: isPopupOpen? 'none' : 'block', boxShadow: 'none' }}>
        <span style={{ textTransform: 'none', fontSize: '13px', fontWeight: 'bold'}}>
        {t('▼ Open Danmaku Selection Panel ▼')}
        </span>
      </Button>

      <div id="DanMuPopup" className="DanMuPageBody"
        style={{ display: isPopupOpen ? 'block' : 'none', backgroundColor: '#ffffff' }}>

          {/* UserInfo 和 Header 已从此处移除 */}

          <IconButton color="inherit" onClick={handleCloseIconClick}
            style={{position: 'absolute', top: 5, right: 5, zIndex: 1, color: '#606060'}}>
            <CloseRoundedIcon style={{fontSize: 24}}/>
          </IconButton>

            {/* 调整了搜索框容器的顶部边距，填补 Logo 消失后的空位 */}
            <div style={{ paddingTop: '40px' }}>
                <CustomizedInputBase onSearchTrigger={handleSearchTrigger}/>
            </div>

            <Modal show={isModalOpen} onClose={() => setIsModalOpen(false)}
              arcurl={selectedVideo ? selectedVideo.arcurl : ''} onLoadDanmakus={handleLoadDanmakusClick}
              pic = {selectedVideo ? selectedVideo.pic : ''} title={selectedVideo ? selectedVideo.title : ''}>
              {selectedVideo && (<div></div>)}
            </Modal>

            {!showMainControls ? (
              <div style={{ padding: '10px' }}>
                <Button variant="outlined" color="error" onClick={showVideoBox} size="small" style={{ marginBottom: '10px' }}>
                  &lt;&lt; {t('Return to Match Video')}
                </Button>

                <div id="mainControls">
                  <h1 className="dmHeader" style={{ color: '#0f0f0f', fontSize: '16px' }}>{t('Search Results')}</h1>
                  {searchMatchVideos.length > 0 ? (
                    searchMatchVideos.map((video, index) => (
                      <VideoBox key={index} {...video} onClick={() => handleVideoClick(video)} />
                    ))
                  ) : (
                    <p className='Unfoundtext' style={{ color: '#606060' }}>{t('No match found :(')}</p>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ padding: '10px' }}>
                <div>
                  <h1 className="dmHeader" style={{ color: '#0f0f0f', fontSize: '15px', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>
                    {t('Best matches (Used by other Users)')}
                  </h1>
                  {bestMatchVideos.length > 0 ? (
                    bestMatchVideos.map((video, index) => (
                      <VideoBox key={index} {...video} onClick={() => handleVideoClick(video)} />
                    ))
                  ) : (
                    <p className='Unfoundtext' style={{ color: '#606060' }}>{t('No match found :(')}</p>
                  )}
                </div>

                <div style={{ marginTop: '20px' }}>
                  <h1 className="dmHeader" style={{ color: '#0f0f0f', fontSize: '15px', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>
                    {t('Possible matches')}
                  </h1>
                  {possibleMatchVideos.length > 0 ? (
                    possibleMatchVideos.map((video, index) => (
                      <VideoBox key={index} {...video} onClick={() => handleVideoClick(video)} />
                    ))
                  ) : (
                    <p className='Unfoundtext' style={{ color: '#606060' }}>{t('No match found :(')}</p>
                  )}
                </div>
              </div>
            )}
    </div>
  </div>
  </ThemeProvider>
  );
}

export default App;