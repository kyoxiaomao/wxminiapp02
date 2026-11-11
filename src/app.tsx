import { perfMark } from '@/utils/perf';
import { useEffect } from 'react';
import Taro, { useDidHide } from '@tarojs/taro';
import { bootstrapAuth } from '@/services/auth';
import { store } from '@/store';
// 全局样式
import './app.scss';

perfMark('App 模块加载');

/** 启动登录；失败弹窗重试，否则页面会一直空着 */
function startBootstrap() {
  bootstrapAuth()
    .then(() => perfMark('bootstrapAuth 完成'))
    .catch(err => {
      console.error('[App] 启动登录失败:', err);
      perfMark('bootstrapAuth 失败');
      Taro.showModal({
        title: '加载失败',
        content: '请检查网络后重试',
        confirmText: '重试',
        showCancel: false,
        success: () => startBootstrap()
      });
    });
}

function App(props) {
  useEffect(() => {
    // 云开发初始化 + 微信登录拿 openid，启动只执行一次
    // 首登用户由 bootstrapAuth 静默播种名片/图谱，并在图谱页自动进入新人指引；
    // 一键授权改为点击「未完善」节点后按需打开，不再启动即跳转引导页
    perfMark('App onLaunch');
    startBootstrap();
  }, []);

  // 切后台可能被杀进程：等待合并的云端写入立刻发出去
  useDidHide(() => store.flushPendingWrites());

  return props.children;
}

export default App;
