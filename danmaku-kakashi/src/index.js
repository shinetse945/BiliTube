import React from 'react';
import ReactDOM from 'react-dom/client';
import './content/index.css';
import App from './App';
import DanmakuHelper from './danmaku/DanmakuHelper';
import { AccessTokenProvider } from './AccessTokenContext';
import { LanguageProvider } from './i18n/LanguageContext';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import './i18n/i18n';

// 1. 创建符合 YouTube 浅色模式的主题
const theme = createTheme({
  palette: {
    mode: 'light',
  },
});

const rootElement = document.createElement("div");
rootElement.id = 'danmaku-kakashi-root';

// 2. 这里的样式控制最外层外框
const globalStyles = document.createElement("style");
globalStyles.innerHTML = `
  #${rootElement.id} {
    height: 600px;
    max-height: 600px;
    width: 100%;
    max-width: 100%;
    border-radius: 12px;
    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    margin-bottom: 10px;
    background-color: transparent !important; /* 改为透明 */
    border: none !important;                  /* 删掉这里的边框 */
    text-align: left !important;
  }
`;
document.head.appendChild(globalStyles);

const root = ReactDOM.createRoot(rootElement);

// 提取纯净的 YouTube 视频 ID
function getVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v') || window.location.href;
}

// 渲染逻辑
function renderApp() {
  root.render(
    <React.Fragment key={getVideoId()}>
      <ThemeProvider theme={theme}>
        <LanguageProvider>
          <AccessTokenProvider>
            <App />
          </AccessTokenProvider>
        </LanguageProvider>
      </ThemeProvider>
    </React.Fragment>
  );
}

// 首次执行
renderApp();
setTimeout(() => {
  DanmakuHelper();
}, 1000);

// DOM 守护者
const observer = new MutationObserver(() => {
  const youtubeSideBar = document.getElementById("secondary-inner");
  if (youtubeSideBar && !document.getElementById("danmaku-kakashi-root")) {
    youtubeSideBar.prepend(rootElement);
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// 监听路由跳转
window.addEventListener('yt-navigate-finish', function() {
  console.log("[Danmaku-Kakashi] 检测到真正的视频切换，目标 ID:", getVideoId());
  renderApp();

  setTimeout(() => {
    try {
      DanmakuHelper();
    } catch(e) {
      console.error("[Danmaku-Kakashi] 弹幕助手重载失败", e);
    }
  }, 1500);
});