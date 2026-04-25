import React from 'react';
import ReactDOM from 'react-dom/client';
import './content/index.css';
import App from './App';
import DanmakuHelper from './danmaku/DanmakuHelper';
import { AccessTokenProvider } from './AccessTokenContext';
import { LanguageProvider } from './i18n/LanguageContext';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import './i18n/i18n';

const theme = createTheme({ palette: { mode: 'light' } });
const rootElement = document.createElement("div");
rootElement.id = 'danmaku-kakashi-root';

// 基础 CSS 注入
const globalStyles = document.createElement("style");
globalStyles.innerHTML = `
  #${rootElement.id} {
    width: 100%;
    margin-bottom: 10px;
    background-color: transparent !important;
    transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1); /* 优化动画曲线 */
    overflow: hidden;
    box-shadow: none !important; /* 强制去除阴影 */
  }
  /* 去除 Material UI 按钮可能的默认阴影 */
  #${rootElement.id} button {
    box-shadow: none !important;
  }
`;
document.head.appendChild(globalStyles);

const root = ReactDOM.createRoot(rootElement);

function startPlugin() {
  const urlParams = new URLSearchParams(window.location.search);
  const vId = urlParams.get('v') || window.location.href;
  
  // 核心：启动前检查存储状态，防止高度跳变
  chrome.storage.sync.get(['MainPanel'], (result) => {
    const isPanelOpen = result.MainPanel !== false;
    rootElement.style.height = isPanelOpen ? '600px' : '40px';
    
    root.render(
      <React.Fragment key={vId}>
        <ThemeProvider theme={theme}>
          <LanguageProvider>
            <AccessTokenProvider>
              <App initOpen={isPanelOpen} /> 
            </AccessTokenProvider>
          </LanguageProvider>
        </ThemeProvider>
      </React.Fragment>
    );
  });

  try { DanmakuHelper(); } catch (e) {}
}

const observer = new MutationObserver(() => {
  const youtubeSideBar = document.getElementById("secondary-inner");
  const isInjected = document.getElementById("danmaku-kakashi-root");
  if (youtubeSideBar && !isInjected) {
    youtubeSideBar.prepend(rootElement);
    startPlugin();
  }
});
observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener('yt-navigate-finish', () => {
  if (document.getElementById("danmaku-kakashi-root")) {
    startPlugin();
  }
});