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
            backgroundColor: 'transparent', // 继承父级背景
            color: '#0f0f0f', // 【核心】：输入文字颜色改为黑色
            '& .MuiInputBase-input::placeholder': {
              color: '#9e9e9e', // 【核心】：占位符改为浅灰色
              opacity: 1,       // 必须加 opacity: 1 否则颜色会变淡
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
          sx={{ p: '10px', color: '#606060' }} // 搜索图标也改为深灰色
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