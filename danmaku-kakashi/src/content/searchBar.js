import React from "react"
import {useState} from 'react'
import { useTranslation } from 'react-i18next';
import './App.css';
import Paper from '@mui/material/Paper';
import InputBase from '@mui/material/InputBase';
import SearchIcon from '@mui/icons-material/Search';
import IconButton from '@mui/material/IconButton';


const CustomizedInputBase = ({onSearchTrigger}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };
  const handleSearch = () => {
    onSearchTrigger(searchTerm);
  };
  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSearch();
    }
  };
  return (
    <div className="topsearch">
      {/* 1. 修改了 Paper 的背景色为浅灰色 #f5f5f5 (模仿 YouTube 搜索框)
          2. 修改了边框颜色为较浅的灰色 #cccccc
      */}
      <Paper
        component="form"
        elevation={0} // 移除阴影让它更平扁，符合现代 UI
        sx={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          backgroundColor: '#f5f5f5',
          border: '1px solid #cccccc',
          borderRadius: '20px', // 圆角化，更美观
          padding: '2px 4px'
        }}
      >
        <InputBase
          sx={{
            ml: 1,
            flex: 1,
            backgroundColor: 'transparent',
            color: '#0f0f0f',
            // 【核心修复】：直接设置 InputBase 的字号，这决定了你打出的字的尺寸
            fontSize: '13px', 
            fontFamily: '"Roboto", "Arial", sans-serif',
            '& .MuiInputBase-input': {
              padding: '8px 0', // 增加上下间距，让大号文字不显得拥挤
            },
            '& .MuiInputBase-input::placeholder': {
              color: '#606060', // 稍微加深一点占位符颜色，更符合 YouTube 风格
              opacity: 1,
              fontSize: '13px', 
            },
          }}
          placeholder={t("输入关键词或 BV号...")}
          inputProps={{ 'aria-label': 'search...' }}
          value={searchTerm}
          onChange={handleSearchChange}
          onKeyDown={handleKeyPress}
        />
        <IconButton
          type="button"
          sx={{ p: '11px', color: '#606060' }} // 搜索图标也改为深灰色
          aria-label="search"
          onClick={handleSearch}
        >
          <SearchIcon />
        </IconButton>
      </Paper>
    </div>
  );
}

export default CustomizedInputBase;