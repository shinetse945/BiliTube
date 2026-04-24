import React from 'react';
import ReactDOM from 'react-dom/client';
import './content/index.css';
import App from './App';
import DanmakuHelper from './danmaku/DanmakuHelper';
import { AccessTokenProvider } from './AccessTokenContext';
import { LanguageProvider } from './i18n/LanguageContext';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import './i18n/i18n';

// 1. YouTube 浅色模式主题
const theme = createTheme({
  palette: {
    mode: 'light',
  },
});

const rootElement = document.createElement("div");
rootElement.id = 'danmaku-kakashi-root';

// 2. 外部容器样式：保持透明边框，适配侧边栏
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
    background-color: transparent !important;
    border: none !important;
    text-align: left !important;
  }
`;
document.head.appendChild(globalStyles);

const root = ReactDOM.createRoot(rootElement);

function getVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v') || window.location.href;
}

// 渲染与初始化逻辑
function startPlugin() {
  console.log("[Danmaku-Kakashi] 正在初始化侧边栏与弹幕助手...");

  // 渲染 React 匹配列表
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

  // 立即激活弹幕助手：它内部会自己等播放器出来
  try {
    DanmakuHelper();
  } catch (e) {
    console.error("[Danmaku-Kakashi] DanmakuHelper 启动失败:", e);
  }
}

// 场景 1：处理页面刷新 (F5)
if (document.readyState === 'complete') {
  startPlugin();
} else {
  window.addEventListener('load', startPlugin);
}

// 场景 2：DOM 守护者：确保在 YouTube 动态渲染侧边栏时能把 UI 插进去
const observer = new MutationObserver(() => {
  const youtubeSideBar = document.getElementById("secondary-inner");
  if (youtubeSideBar && !document.getElementById("danmaku-kakashi-root")) {
    youtubeSideBar.prepend(rootElement);
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// 场景 3：处理点击推荐视频 (单页跳转)
window.addEventListener('yt-navigate-finish', () => {
  console.log("[Danmaku-Kakashi] 路由跳转，重新初始化");
  startPlugin();
});