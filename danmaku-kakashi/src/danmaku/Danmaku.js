import React from "react";
import {BilibiliFormat, CommentManager, CommentProvider} from "./CommentCoreLibrary";

const defaultSettings = { "maxDanmakuAmount": 100, "opacity": 100, "fontSize": 100, "speed": 50 };

class Danmaku extends React.Component {
    settings = defaultSettings;
    offset = 0;

    resetDanmakus = () => {
        if (this.commentManager) this.commentManager.clear();
        if (this.commentProvider) this.commentProvider.destroy();
        this.initCCL();
    }

    getSetting(key) {
        const result = this.settings.danmakuSettings[key] || defaultSettings[key];
        if (key === "maxDanmakuAmount") {
            return this.translateMaxDanmakuAmount(result);
        }
        return result;
    }

    initCCL = () => {
        // Set up comment manager
        const danmakuCanvas = document.getElementById("danmaku-canvas");
        if (!danmakuCanvas) return;
        
        this.commentManager = new CommentManager(danmakuCanvas);
        this.commentManager.init();
        this.setCCLSettings();
        this.commentManager.start();
        this.initCommentProvider();
    }

    setCCLSettings = () => {
        this.commentManager.options.global.opacity = this.getSetting("opacity") / 100;
        this.commentManager.options.global.scale = 1.3 * ((100 - this.getSetting("speed")) / 50);
        this.commentManager.options.global.fontScale = this.getSetting("fontSize") / 100;
        this.commentManager.options.scroll.opacity = this.getSetting("opacity") / 100;
        this.commentManager.options.scroll.scale = 1.3 * ((100 - this.getSetting("speed")) / 50);
        this.commentManager.options.scroll.fontScale = this.getSetting("fontSize") / 100;
        this.commentManager.options.limit = this.getSetting("maxDanmakuAmount");
    }

    initCommentProvider = () => {
        // Set up comment provider
        this.commentProvider = new CommentProvider();
        this.commentProvider.addParser(new BilibiliFormat.XMLParser(), CommentProvider.SOURCE_XML);
        this.commentProvider.addTarget(this.commentManager);
        this.commentProvider.load().catch((err) => {
            console.error("Failed to load comments:", err);
        });
    }

    registerSettingsListener = () => {
        this.storageListener = (changes, namespace) => {
            for (let key in changes) {
                if (key === "danmakuSettings") {
                    this.settings[key] = changes[key].newValue;
                    this.setCCLSettings();
                }
            }
        };
        chrome.storage.onChanged.addListener(this.storageListener);
    }

    unregisterSettingsListener = () => {
        if (this.storageListener) {
            chrome.storage.onChanged.removeListener(this.storageListener);
            this.storageListener = null;
        }
    }

    createVideoListeners = () => {
        this.videoPlayer = document.getElementsByTagName("video")[0];
        if (!this.videoPlayer) return;

        this.videoPlayHandler = () => this.commentManager?.start();
        this.videoPauseHandler = () => this.commentManager?.stop();
        this.videoSeekingHandler = () => {
            this.commentManager?.clear();
            this.commentManager?.time(this.videoPlayer.currentTime * 1000 + this.offset * 1000);
        };
        this.videoTimeupdateHandler = () => {
            let movie_player = document.getElementById('movie_player');
            if (movie_player && movie_player.classList.contains("ad-interrupting")) {
                return;
            }
            this.commentManager?.time(this.videoPlayer.currentTime * 1000 + this.offset * 1000);
        };

        this.videoPlayer.addEventListener("play", this.videoPlayHandler);
        this.videoPlayer.addEventListener("pause", this.videoPauseHandler);
        this.videoPlayer.addEventListener("seeking", this.videoSeekingHandler);
        this.videoPlayer.addEventListener("timeupdate", this.videoTimeupdateHandler);

        if (!this.mutationObserver) {
            this.mutationObserver = new MutationObserver(() => this.resizeDanmakuCanvas());
            this.mutationObserver.observe(this.videoPlayer, {attributes: true, attributeFilter: ["style"]});
        }
    }

    removeVideoListeners = () => {
        if (this.videoPlayer) {
            this.videoPlayer.removeEventListener("play", this.videoPlayHandler);
            this.videoPlayer.removeEventListener("pause", this.videoPauseHandler);
            this.videoPlayer.removeEventListener("seeking", this.videoSeekingHandler);
            this.videoPlayer.removeEventListener("timeupdate", this.videoTimeupdateHandler);
        }
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
    }

    resizeDanmakuCanvas = () => {
        const danmakuCanvas = document.getElementById("danmaku-canvas");
        const danmakuContainer = document.getElementById("danmaku-container");
        const videoContainer = document.getElementById("movie_player");
        if (!danmakuCanvas || !videoContainer || !this.commentManager) {
            return;
        }

        const defWidth = 1280;
        const defHeight = 720;
        const width = parseInt(videoContainer.offsetWidth, 10);
        const height = parseInt(videoContainer.offsetHeight, 10);

        const scale = Math.sqrt(Math.min(width / defWidth, height / defHeight));
        const relWidth = Math.floor(width / scale);
        const relHeight = Math.floor(height / scale);

        if (danmakuContainer) {
            danmakuContainer.style.width = width + "px";
            danmakuContainer.style.height = height + "px";
        }

        this.commentManager.stage.style.width = relWidth + "px";
        this.commentManager.stage.style.height = relHeight + "px";
        this.commentManager.stage.style.transform = "scale(" + scale + ")";
        this.commentManager.stage.style.webkitFontSmoothing = "subpixel-antialiased";
        this.commentManager.setBounds(relWidth, relHeight);
    }

    addDanmakuSource = (source) => {
        chrome.runtime.sendMessage({type: "DOWNLOAD_DANMAKU", url: source}, (response) => {
            if (!this.commentManager || !this.commentProvider) return;
            this.commentManager.stop();
            this.commentManager.time(0);
            this.commentProvider.addStaticSource(CommentProvider.XMLProvider('GET', response.danmakuxml), CommentProvider.SOURCE_XML);

            this.commentProvider.load().then(() => {
                if (this.commentManager) this.commentManager.start();
            }).catch((err) => {
                console.error("Failed to load comments:", err);
            });
        });
    }

    toggleDanmakuVisibility = () => {
        const danmakuContainer = document.getElementById("danmaku-container");
        if (danmakuContainer) {
            if (danmakuContainer.classList.contains("hideDanmakus")) {
                danmakuContainer.classList.remove("hideDanmakus");
                return true;
            } else {
                danmakuContainer.classList.add("hideDanmakus");
                return false;
            }
        }
    }

    translateMaxDanmakuAmount = (value) => {
        if (value == 5) {
            return -1;
        } else if (value == 4) {
            return 100;
        } else if (value == 3) {  
            return 50;
        } else if (value == 2) {
            return 10;
        } else if (value == 1) {
            return 5;
        }
    }

    constructor(props) {
        super(props);
        this.commentManager = null;
        this.commentProvider = null;
        this.mutationObserver = null;
        this.offsetObserver = null;
        this.storageListener = null;
        this.videoPlayer = null;
        this.videoPlayHandler = null;
        this.videoPauseHandler = null;
        this.videoSeekingHandler = null;
        this.videoTimeupdateHandler = null;
    }

    async componentDidMount() {
        const data = await chrome.storage.sync.get("danmakuSettings");
        this.settings = data?.danmakuSettings ? data : { danmakuSettings: defaultSettings };
        this.registerSettingsListener();

        this.initCCL();
        this.createVideoListeners();
        this.resizeDanmakuCanvas();

        // Set up window methods
        window.resetDanmakus = this.resetDanmakus;
        window.addDanmakuSource = this.addDanmakuSource;
        window.toggleDanmakuVisibility = this.toggleDanmakuVisibility;

        // Add listener for offset changes
        const offsetElement = document.getElementById("danmaku-offset");
        if (offsetElement) {
            this.offsetObserver = new MutationObserver(() => {
                this.offset = parseInt(offsetElement.textContent, 10);
            });
            this.offsetObserver.observe(offsetElement, {childList: true});
        }
    }

    componentWillUnmount() {
        // Clean up comment manager
        if (this.commentManager) {
            this.commentManager.stop();
        }
        if (this.commentProvider) {
            this.commentProvider.destroy();
        }

        // Clean up event listeners
        this.removeVideoListeners();
        this.unregisterSettingsListener();

        // Clean up observers
        if (this.offsetObserver) {
            this.offsetObserver.disconnect();
            this.offsetObserver = null;
        }

        // Clean up window methods
        delete window.resetDanmakus;
        delete window.addDanmakuSource;
        delete window.toggleDanmakuVisibility;
    }

    render() {
        return (
            <>
                <div id="danmaku-canvas" className={`container`} />
                <div id="danmaku-offset" style={{display: "none"}} />
            </>
        );
    }
}

export default Danmaku;
