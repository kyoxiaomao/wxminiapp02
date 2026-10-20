import Taro from '@tarojs/taro';

/**
 * 全局 Toast 工具（基于 Taro 原生 API 封装，无需自建组件）
 * - 全局遮罩 loading：toast.loading() / toast.hideLoading()
 * - 轻提示：toast.success / toast.error / toast.info
 * - 行内局部 loading 请使用 components/Loading 组件
 */
export const toast = {
  success: (title: string) => {
    Taro.showToast({ title, icon: 'success' });
  },
  error: (title: string) => {
    Taro.showToast({ title, icon: 'error' });
  },
  info: (title: string) => {
    Taro.showToast({ title, icon: 'none' });
  },
  loading: (title = '加载中...') => {
    Taro.showLoading({ title, mask: true });
  },
  hideLoading: () => {
    Taro.hideLoading();
  }
};
