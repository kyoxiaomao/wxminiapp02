import React, { useEffect } from 'react';
import Taro, { useDidShow, useDidHide } from '@tarojs/taro';
import { bootstrapAuth } from '@/services/auth';
import { store } from '@/store';
// 全局样式
import './app.scss';

/** 首登建名片引导页跳转（启动竞态兜底：页面栈未就绪时稍后重试一次） */
function redirectOnboarding(): void {
  Taro.redirectTo({ url: '/pages/onboarding/index' }).catch(() => {
    setTimeout(() => {
      Taro.redirectTo({ url: '/pages/onboarding/index' }).catch(err =>
        console.error('[App] 引导页跳转失败:', err)
      );
    }, 500);
  });
}

function App(props) {
  // 可以使用所有的 React Hooks
  useEffect(() => {
    // 云开发初始化 + 微信登录拿 openid（替换本地 mock 用户），启动只执行一次
    // 首登（未完成建名片引导）自动进入引导页收集头像/昵称，建立我的名片
    bootstrapAuth()
      .then(({ onboarded }) => {
        if (!onboarded) {
          // 分享落地的新用户：先引导一键授权，完成后回到被分享的名片详情（而不是首页）
          try {
            const launch = Taro.getLaunchOptionsSync();
            const path = (launch?.path || '').replace(/^\//, '');
            const id = launch?.query?.id;
            if (path === 'pages/card/detail/index' && id) {
              store.onboardRedirect = `/pages/card/detail/index?id=${id}`;
              console.info('[App] 分享落地（新用户）：引导完成后打开名片 %s', id);
            }
          } catch (err) {
            console.error('[App] 读取启动参数失败:', err);
          }
          redirectOnboarding();
        }
      })
      .catch(err => console.error('[App] 启动登录失败:', err));
  }, []);

  // 对应 onShow
  useDidShow(() => {});

  // 对应 onHide
  useDidHide(() => {});

  return props.children;
}

export default App;
