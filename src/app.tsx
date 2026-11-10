import { perfMark } from '@/utils/perf';
import React, { useEffect } from 'react';
import { useDidShow, useDidHide } from '@tarojs/taro';
import { bootstrapAuth } from '@/services/auth';
// 全局样式
import './app.scss';

perfMark('App 模块加载');

function App(props) {
  // 可以使用所有的 React Hooks
  useEffect(() => {
    // 云开发初始化 + 微信登录拿 openid（替换本地 mock 用户），启动只执行一次
    // 首登用户由 bootstrapAuth 静默播种名片/图谱，并在图谱页自动进入新人指引；
    // 一键授权改为点击「未完善」节点后按需打开，不再启动即跳转引导页
    perfMark('App onLaunch');
    bootstrapAuth()
      .then(() => perfMark('bootstrapAuth 完成'))
      .catch(err => {
        console.error('[App] 启动登录失败:', err);
        perfMark('bootstrapAuth 失败');
      });
  }, []);

  // 对应 onShow
  useDidShow(() => {});

  // 对应 onHide
  useDidHide(() => {});

  return props.children;
}

export default App;
