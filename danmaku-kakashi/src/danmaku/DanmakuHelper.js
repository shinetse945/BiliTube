import React from "react";
import ReactDOM from "react-dom/client";
import Danmaku from "./Danmaku";
import "./ccl-base.css";

function injectDanmakuDOM() {
    // 防止重复注入：如果正在注入中，则跳过
    if (document.getElementById("danmaku-container-injecting")) {
        return;
    }

    const danmakuContainerInjecting = document.createElement("div");
    danmakuContainerInjecting.id = "danmaku-container-injecting";
    document.body.appendChild(danmakuContainerInjecting);

    console.log("[Danmaku-Kakashi] 正在注入弹幕 DOM 容器...");

    let danmakuDOM = document.getElementById("danmaku-container");

    // 如果已经存在容器（说明是跳转过来的），则尝试重置
    if (danmakuDOM) {
        if (typeof window.resetDanmakus === 'function') {
            window.resetDanmakus();
            console.log("[Danmaku-Kakashi] 已重置弹幕容器");
        }
        danmakuContainerInjecting.remove();
    } else {
        danmakuDOM = document.createElement("div");
        danmakuDOM.id = "danmaku-container";

        // 持续检查 YouTube 视频播放器是否就绪
        const checkExist = setInterval(function () {
            const videoPlayer = document.getElementsByTagName("video")[0];
            const movie_player = document.getElementById('movie_player');

            if (videoPlayer && movie_player) {
                console.log("[Danmaku-Kakashi] 视频播放器已找到");
                const width = movie_player.offsetWidth || 640;
                const height = movie_player.offsetHeight || 360;

                clearInterval(checkExist);

                danmakuDOM.classList.add("m20");
                danmakuDOM.classList.add("abp");
                danmakuDOM.style.cssText = `
                    width: ${width}px;
                    height: ${height}px;
                    left: 0;
                    top: 0;
                    position: absolute;
                    pointer-events: none;
                `;

                // 将弹幕层插入视频标签的上方
                videoPlayer.parentElement.insertBefore(danmakuDOM, videoPlayer.nextSibling);

                const danmakuRoot = ReactDOM.createRoot(danmakuDOM);
                danmakuRoot.render(
                    <React.Fragment>
                        <Danmaku />
                    </React.Fragment>
                );

                danmakuContainerInjecting.remove();
                console.log("[Danmaku-Kakashi] 弹幕容器渲染完毕，全局函数已就绪");
            }
        }, 200); // 每 200ms 检查一次
    }
}

function handleBackgroundMessage(request, sender, sendResponse) {
    if (request.type === 'youtubeid') {
        console.log("[Danmaku-Kakashi] 收到背景脚本消息，触发注入");
        injectDanmakuDOM();
    }
}

function DanmakuHelper() {
    // 1. 重新注册消息监听器（先移除再添加，防止多次绑定）
    chrome.runtime.onMessage.removeListener(handleBackgroundMessage);
    chrome.runtime.onMessage.addListener(handleBackgroundMessage);

    // 2. 【核心修复】：如果是刷新页面，主动执行一次注入
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('v')) {
        console.log("[Danmaku-Kakashi] 检测到视频页面，主动开启弹幕环境");
        injectDanmakuDOM();
    }
}

export default DanmakuHelper;