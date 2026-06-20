import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './DanmakuPanel.css';
import ReactDOM from "react-dom/client";

// Initialize default settings
const init_settings = {
    maxDanmakuAmount: 100,
    opacity: 100,
    fontSize: 100,
    speed: 50,
  };

  // Helper function to translate maxDanmakuAmount slider value
  const translateMaxDanmakuAmount = (value) => {
    const mapping = {
      1: 5,
      2: 10,
      3: 50,
      4: 100,
      5: -1, // Unlimited
    };
    return mapping[value] !== undefined ? mapping[value] : 100;
  };

  const DanmuPanel = () => {
    const { t } = useTranslation();

    // State for settings
    const [settings, setSettings] = useState(init_settings);
    const [currentOffset, setCurrentOffset] = useState(0.0);
    // Danmaku on/off state (moved into the panel)
    const [danmakuEnabled, setDanmakuEnabled] = useState(true);

    const debounceTimer = useRef(null);

    // Fetch settings from chrome.storage on mount
    useEffect(() => {
      chrome.storage.sync.get(['danmakuSettings', 'danmakuEnabled'], (result) => {
        const storedSettings = result.danmakuSettings || init_settings;
        setSettings(storedSettings);
        // default to enabled when not previously set
        setDanmakuEnabled(result.danmakuEnabled !== false);
      });
    }, []);

    // Update chrome.storage whenever settings change
    useEffect(() => {
      chrome.storage.sync.set({ danmakuSettings: settings });
    }, [settings]);

    // Handle slider changes with debouncing
    const handleSliderChange = (e) => {
      const { id, value } = e.target;

      // Update settings state
      setSettings((prev) => ({
        ...prev,
        [id]: parseInt(value, 10),
      }));

      // Debounce saving settings
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(() => {
        // Settings are already updated in state, so no action needed here
      }, 250);
    };

    // Toggle danmaku visibility from inside the panel
    const handleToggleDanmaku = () => {
      const res = window.toggleDanmakuVisibility?.();
      const next = typeof res === 'boolean' ? res : !danmakuEnabled;
      setDanmakuEnabled(next);
      chrome.storage.sync.set({ danmakuEnabled: next });
      // keep the toolbar button icon in sync
      const btn = document.getElementsByClassName('DanmuControl')[0];
      if (btn) {
        next ? btn.classList.remove('makeGray') : btn.classList.add('makeGray');
      }
    };

    // 写入偏移到隐藏元素，触发 Danmaku.js 的 MutationObserver
    const writeOffset = (value) => {
      const rounded = Math.round(value * 10) / 10; // 规避浮点累加误差
      setCurrentOffset(rounded);
      const danmakuOffsetElement = document.getElementById('danmaku-offset');
      if (danmakuOffsetElement) {
        danmakuOffsetElement.textContent = rounded.toFixed(1);
      }
    };

    // 按步进调整偏移（+0.1 / -0.1）
    const handleStepTime = (step) => {
      writeOffset(currentOffset + step);
    };

    // 重置偏移
    const handleClearTime = () => {
      writeOffset(0);
    };

    return (
      <div className="danmu-panel" id="DanmuControlPanel">

        <h3>{t('Danmaku Settings')}</h3>

        {/* Danmaku on/off toggle */}
        <div className="danmu-toggle-group">
          <span className="slider-label">{t('Show Danmaku')}</span>
          <label className="danmu-switch">
            <input
              type="checkbox"
              checked={danmakuEnabled}
              onChange={handleToggleDanmaku}
            />
            <span className="danmu-switch-slider"></span>
          </label>
        </div>

        {/* Max Danmaku Amount */}
        <div className="slider-group">
          <span className="slider-label">{t('Max Danmaku Count')}</span>
          <input
            id="maxDanmakuAmount"
            type="range"
            min="1"
            max="5"
            step="1"
            value={settings.maxDanmakuAmount}
            list="maxDanmakuAmountOptions"
            className="danmu-slider"
            onChange={handleSliderChange}
          />
          <datalist id="maxDanmakuAmountOptions">
            <option value="1" label="5"></option>
            <option value="2" label="10"></option>
            <option value="3" label="50"></option>
            <option value="4" label="100"></option>
            <option value="5" label="10000"></option>
          </datalist>
          <span className="slider-value">
            {translateMaxDanmakuAmount(settings.maxDanmakuAmount) === -1
              ? t('Unlimited')
              : translateMaxDanmakuAmount(settings.maxDanmakuAmount)}
          </span>
        </div>

        {/* Opacity */}
        <div className="slider-group">
          <span className="slider-label">{t('Opacity')}</span>
          <input
            type="range"
            min="0"
            max="100"
            value={settings.opacity}
            className="danmu-slider"
            id="opacity"
            onChange={handleSliderChange}
          />
          <span className="slider-value">{`${settings.opacity}%`}</span>
        </div>

        {/* Font Size */}
        <div className="slider-group">
          <span className="slider-label">{t('Font Size')}</span>
          <input
            type="range"
            min="50"
            max="200"
            value={settings.fontSize}
            className="danmu-slider"
            id="fontSize"
            onChange={handleSliderChange}
          />
          <span className="slider-value">{`${settings.fontSize}%`}</span>
        </div>

        {/* Speed */}
        <div className="slider-group">
          <span className="slider-label">{t('Speed')}</span>
          <input
            type="range"
            min="1"
            max="100"
            value={settings.speed}
            className="danmu-slider"
            id="speed"
            onChange={handleSliderChange}
          />
          <span className="slider-value">{settings.speed}</span>
        </div>

        {/* Time Adjust Section */}
        <div className="time-adjust-section">
          <div className="time-adjust-header">
            <h4>{t('Danmaku time offset')}</h4>
          </div>

          <div className="time-stepper-row">
            <button className="time-step-button" onClick={() => handleStepTime(-0.1)}>
              −0.1
            </button>
            <span className="time-stepper-value">
              {currentOffset >= 0 ? '+' : ''}{currentOffset.toFixed(1)}s
            </span>
            <button className="time-step-button" onClick={() => handleStepTime(0.1)}>
              +0.1
            </button>
            <button className="time-clear-button" onClick={handleClearTime}>
              {t('Clear')}
            </button>
          </div>
        </div>
      </div>
    );
  };

function appendDanmakuControl(youtubeRightControls, DanmuBtn) {
    // create a wrapper to hold both button and panel
    const parentWrapper = document.createElement("div");
    parentWrapper.className = "danmu-control-wrapper";
    parentWrapper.style.position = "relative";
    parentWrapper.style.display = "inline-block";

    const DanmuPan = document.createElement("div");
    DanmuPan.id = "DanmuPanel";
    DanmuPan.style.display = "none";

    const DanmuPanelRoot = ReactDOM.createRoot(DanmuPan);
    DanmuPanelRoot.render(
        <>
            <DanmuPanel />
        </>
    );

    // assemble: button + panel inside the wrapper
    parentWrapper.appendChild(DanmuBtn);
    parentWrapper.appendChild(DanmuPan);

    // append the wrapper to the right controls
    youtubeRightControls.prepend(parentWrapper);

    return DanmuPan;
}

export default appendDanmakuControl;
