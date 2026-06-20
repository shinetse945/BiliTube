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

// 词典码（Dictionary Code）编解码：JSON -> UTF-8 -> Base64，前缀做版本标识与校验
const DICT_CODE_PREFIX = 'BTDICT1.';

const encodeDictCode = (list) => {
  const cleaned = (list || [])
    .filter((item) => item && item.kr && item.zh && item.kr.trim() !== '' && item.zh.trim() !== '')
    .map((item) => ({ kr: item.kr.trim(), zh: item.zh.trim() }));
  if (cleaned.length === 0) return '';
  const json = JSON.stringify(cleaned);
  // 处理 Unicode：先 encodeURIComponent 再转 Base64，避免 btoa 对非 Latin1 字符报错
  const base64 = btoa(unescape(encodeURIComponent(json)));
  return DICT_CODE_PREFIX + base64;
};

const decodeDictCode = (code) => {
  if (!code || typeof code !== 'string') return null;
  const trimmed = code.trim();
  if (!trimmed.startsWith(DICT_CODE_PREFIX)) return null;
  try {
    const base64 = trimmed.slice(DICT_CODE_PREFIX.length);
    const json = decodeURIComponent(escape(atob(base64)));
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    const valid = parsed
      .filter((item) => item && typeof item.kr === 'string' && typeof item.zh === 'string' && item.kr.trim() !== '' && item.zh.trim() !== '')
      .map((item) => ({ kr: item.kr.trim(), zh: item.zh.trim() }));
    return valid;
  } catch (e) {
    return null;
  }
};

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
  const { t } = useTranslation();
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
  // 词典码导入/导出提示状态
  const [dictToast, setDictToast] = useState('');
  const dictToastTimer = useRef(null);
  // 匹配逻辑帮助弹窗
  const [showDictHelp, setShowDictHelp] = useState(false);

  // 词典面板原生拖动：拖动时直接改 DOM transform，不经过 React 渲染，做到零延迟跟手
  const dragState = useRef({ startX: 0, startY: 0, offsetX: 0, offsetY: 0 });

  const handleDragPointerDown = (e) => {
    // 仅响应主键（左键/触摸/笔）
    if (e.button !== undefined && e.button !== 0) return;
    // 在交互控件（输入框/按钮/链接等）上按下时不启动拖动，让其正常获得点击/聚焦
    if (e.target.closest('input, textarea, button, a, select, [role="button"]')) return;
    const node = draggableNodeRef.current;
    if (!node) return;
    const st = dragState.current;
    st.startX = e.clientX;
    st.startY = e.clientY;
    // 是否已越过拖动阈值；只有真正拖动后才接管指针、禁用过渡
    let dragging = false;
    const DRAG_THRESHOLD = 4; // px
    const captureTarget = e.currentTarget;
    const pointerId = e.pointerId;

    // 移动/抬起处理器在此闭包内定义，捕获本次拖动起点，避免 stale closure
    const onMove = (ev) => {
      const dx = ev.clientX - st.startX;
      const dy = ev.clientY - st.startY;
      if (!dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        // 真正开始拖动：此刻才接管指针并禁用过渡
        dragging = true;
        node.style.transition = 'none';
        node.style.willChange = 'transform';
        try { captureTarget.setPointerCapture?.(pointerId); } catch (err) {}
      }
      const nextX = st.offsetX + dx;
      const nextY = st.offsetY + dy;
      // 直接写 transform，由合成器逐帧更新，跟手无延迟
      node.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!dragging) return; // 纯点击：不改偏移、不拦截后续 click，保证内部交互正常
      // 把本次位移累加进基准偏移，供下次拖动继续
      st.offsetX += (ev.clientX - st.startX);
      st.offsetY += (ev.clientY - st.startY);
      node.style.willChange = 'auto';
      try { captureTarget.releasePointerCapture?.(pointerId); } catch (err) {}
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // 每次打开面板时重置拖动偏移，回到初始位置
  useEffect(() => {
    if (showDictSettings) {
      dragState.current.offsetX = 0;
      dragState.current.offsetY = 0;
      if (draggableNodeRef.current) draggableNodeRef.current.style.transform = 'translate3d(0px, 0px, 0)';
    }
  }, [showDictSettings]);

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
    if (window.confirm(t('Confirm Clear Dict'))) {
      setDictList(INITIAL_DICT);
      dictListRef.current = INITIAL_DICT;
      chrome.storage.sync.remove(['customKpopDict']);
    }
  };

  // 临时提示（自动消失）
  const showDictToast = (msg) => {
    setDictToast(msg);
    if (dictToastTimer.current) clearTimeout(dictToastTimer.current);
    dictToastTimer.current = setTimeout(() => setDictToast(''), 2500);
  };

  // 导出词典码到剪贴板
  const exportDict = () => {
    const code = encodeDictCode(dictList);
    if (!code) { showDictToast(t('No Entry To Export')); return; }
    navigator.clipboard.writeText(code)
      .then(() => showDictToast(t('Code Copied')))
      .catch(() => showDictToast(t('Copy Failed')));
  };

  // 应用导入的条目（合并或覆盖）
  const applyImportedDict = (imported, mode) => {
    let merged;
    if (mode === 'overwrite') {
      merged = imported;
    } else {
      const map = new Map();
      dictList.forEach((item) => { if (item.kr && item.kr.trim() !== '') map.set(item.kr.trim(), item.zh.trim()); });
      imported.forEach((item) => map.set(item.kr, item.zh));
      merged = Array.from(map.entries()).map(([kr, zh]) => ({ kr, zh }));
    }
    setDictList(merged);
    dictListRef.current = merged;
    chrome.storage.sync.set({ customKpopDict: merged }, () => {
      showDictToast(t('Import Success', { count: imported.length }));
    });
  };

  // 从输入框导入词典码
  const importDict = () => {
    const code = window.prompt(t('Import Prompt'));
    if (!code) return;
    const imported = decodeDictCode(code);
    if (!imported || imported.length === 0) { showDictToast(t('Import Failed')); return; }
    const hasExisting = dictList.some((item) => item.kr && item.kr.trim() !== '' && item.zh && item.zh.trim() !== '');
    if (hasExisting) {
      const merge = window.confirm(t('Import Mode Prompt') + '\n\nOK = ' + t('Merge') + ' / Cancel = ' + t('Overwrite'));
      applyImportedDict(imported, merge ? 'merge' : 'overwrite');
    } else {
      applyImportedDict(imported, 'overwrite');
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
      // 创建与 YouTube 控制栏风格一致的弹幕按钮（内嵌 SVG 图标）
      // 与原生控件一致：固定 36x36，SVG 用 100% 填充并由 viewBox 居中绘制
      const DanmuBtn = document.createElement("button");
      DanmuBtn.className = "ytp-button DanmuControl";
      DanmuBtn.title = "弹幕";
      DanmuBtn.setAttribute("aria-label", "弹幕");
      DanmuBtn.innerHTML = `
        <svg version="1.1" viewBox="0 0 24 24">
          <g fill="#ffffff">
            <!-- 飞行的弹幕子弹：圆头 + 拖尾，整体在 24x24 内水平居中 -->
            <circle cx="5" cy="6" r="1.8"></circle>
            <rect x="8" y="5" width="11" height="2" rx="1"></rect>
            <circle cx="17" cy="12" r="1.8"></circle>
            <rect x="5" y="11" width="10" height="2" rx="1"></rect>
            <circle cx="7" cy="18" r="1.8"></circle>
            <rect x="10" y="17" width="9" height="2" rx="1"></rect>
          </g>
        </svg>
      `;
      const checkExist = setInterval(function() {
        const youtubeRightControls = document.getElementsByClassName("ytp-right-controls")[0];
        if (youtubeRightControls) {
          clearInterval(checkExist);
          const DanmuPanel = appendDanmakuControl(youtubeRightControls, DanmuBtn);

          // 点击按钮切换面板显示/隐藏（仿 YouTube 设置面板行为）
          DanmuBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            DanmuPanel.style.display = DanmuPanel.style.display === "block" ? "none" : "block";
          });

          // 点击面板内部不关闭面板
          DanmuPanel.addEventListener("click", (e) => { e.stopPropagation(); });

          // 点击页面其他位置时关闭面板
          document.addEventListener("click", () => { DanmuPanel.style.display = "none"; });

          // 同步开关弹幕的初始按钮状态
          chrome.storage.sync.get(["danmakuEnabled"], (result) => {
            if (result.danmakuEnabled === false) DanmuBtn.classList.add("makeGray");
          });
        }
      }, 400);
    }
  };

  const handleCloseIconClick = () => {
    const root = document.getElementById('bilitube-root');
    if (root) root.style.height = '42px';
    setTimeout(() => setIsPopupOpen(false), 150);
    chrome.storage.sync.set({MainPanel: false});
  };

  const handleLogoClick = () => {
    const root = document.getElementById('bilitube-root');
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

        {/* 词典编辑器 - 悬浮模式（原生拖动，零延迟跟手）*/}
        {showDictSettings && (
            <div 
              ref={draggableNodeRef}
              style={{ 
                position: 'fixed', top: '100px', right: '40px', width: '560px', 
                backgroundColor: '#ffffff', borderRadius: '12px', zIndex: 9999, 
                boxShadow: '0 8px 30px rgba(0,0,0,0.12)', border: '1px solid #eeeeee',
                display: 'flex', flexDirection: 'column', transition: 'none' 
              }}
            >
              <div
                className="dm-dict-panel"
                onPointerDown={handleDragPointerDown}
                style={{ padding: '18px 20px 20px 20px', cursor: 'grab', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}
              >
                {/* 头部：图标 + 标题 + 副标题 / 导入导出 */}
                <div className="dm-dict-header">
                  <div className="dm-dict-title-group">
                    <div className="dm-dict-title-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                    </div>
                    <div>
                      <div className="dm-dict-title-text">
                        {t('Dictionary Mapping')}
                        <button
                          className="dm-dict-help-btn"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => setShowDictHelp(true)}
                          title={t('Help Title')}
                          aria-label={t('Help Title')}
                          style={{ background: 'none', border: 'none', padding: '6px', marginLeft: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', verticalAlign: 'middle', borderRadius: '50%', color: '#909090', transition: 'background-color 0.15s ease, color 0.15s ease, transform 0.15s ease' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.08)'; e.currentTarget.style.color = '#f03131'; e.currentTarget.style.transform = 'scale(1.15)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#909090'; e.currentTarget.style.transform = 'scale(1)'; }}
                          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)'; }}
                          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        </button>
                      </div>
                      <div className="dm-dict-subtitle">{t('Dictionary Subtitle')}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="dm-tool-btn" onClick={importDict} title={t('Import Code')}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f0f0f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      {t('Import Code')}
                    </button>
                    <button className="dm-tool-btn" onClick={exportDict} title={t('Export Code')}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f0f0f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                      {t('Export Code')}
                    </button>
                    <IconButton className="dm-icon-btn" onPointerDown={(e) => e.stopPropagation()} onClick={() => setShowDictSettings(false)} size="small">
                      <CloseRoundedIcon style={{ fontSize: 22, color: '#909090' }}/>
                    </IconButton>
                  </div>
                </div>

                {/* 操作结果提示条 */}
                {dictToast && (
                  <div className="dm-dict-toast">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1b7a43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    {dictToast}
                  </div>
                )}

                {/* 统计条 */}
                <div className="dm-dict-stats">
                  <span className="dm-dict-count-badge">{dictList.length}</span>
                  {t('Mapping Count')}
                </div>

                {/* 条目列表 / 空状态 */}
                <div className="dm-dict-list" onPointerDown={(e) => e.stopPropagation()}>
                  {dictList.length === 0 ? (
                    <div className="dm-dict-empty">
                      <div className="dm-dict-empty-icon">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#b0b0b0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                      </div>
                      <div className="dm-dict-empty-text">{t('Dictionary Empty')}</div>
                    </div>
                  ) : (
                    dictList.map((item, index) => (
                      <div key={index} className="dm-dict-row">
                        <input className="dm-dict-input" type="text" placeholder={t('Original Word')} value={item.kr} onChange={(e) => handleDictChange(index, 'kr', e.target.value)} />
                        <span className="dm-dict-arrow">→</span>
                        <input className="dm-dict-input" type="text" placeholder={t('Chinese Replacement')} value={item.zh} onChange={(e) => handleDictChange(index, 'zh', e.target.value)} />
                        <button className="dm-dict-remove" onClick={() => removeDictRow(index)} title={t('Clear All')}>×</button>
                      </div>
                    ))
                  )}
                </div>

                <button className="dm-dict-add" onClick={addDictRow}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  {t('Add New Entry')}
                </button>

                <div className="dm-dict-footer">
                  <button className="dm-dict-clear" onClick={clearDict}>{t('Clear All')}</button>
                  <button className="dm-dict-save" onClick={saveDict}>{t('Save And Apply')}</button>
                </div>
              </div>
            </div>
        )}

        {/* 主控制面板 */}
        <div id="DanMuPopup" style={{ display: isPopupOpen ? 'flex' : 'none', flexDirection: 'column', height:'560px', overflow: 'hidden', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e5e5' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px', borderBottom: '1px solid #f2f2f2', gap: '8px' }}>
            <div style={{ flex: 1 }}><CustomizedInputBase onSearchTrigger={handleSearchTrigger}/></div>
            
            <button className="dm-icon-btn" onClick={() => setShowDictSettings(!showDictSettings)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#606060" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            </button>

            <button className="dm-icon-btn" onClick={refreshMatchedVideos} disabled={isRefreshing} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', display: 'flex' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#606060" strokeWidth="2" style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36"></path></svg>
            </button>

            <IconButton className="dm-icon-btn" onClick={handleCloseIconClick} size="medium"><CloseRoundedIcon style={{ fontSize: 28 }}/></IconButton>
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

        {/* 匹配逻辑帮助弹窗 */}
        {showDictHelp && (
          <div
            onClick={() => setShowDictHelp(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 10000,
              backgroundColor: 'rgba(0,0,0,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '460px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto',
                backgroundColor: '#ffffff', borderRadius: '12px', padding: '24px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.2)', fontFamily: '"Roboto", Arial, sans-serif'
              }}
            >
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f0f0f', marginBottom: '16px' }}>
                {t('Help Title')}
              </div>
              <div style={{ fontSize: '13px', lineHeight: 1.7, color: '#404040', whiteSpace: 'pre-line' }}>
                {t('Help Content')}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button className="dm-dict-save" onClick={() => setShowDictHelp(false)}>
                  {t('Got It')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </ThemeProvider>
  );
}

export default App;