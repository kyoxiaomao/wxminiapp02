import { useEffect, useState } from 'react';
import { store } from './index';

/**
 * 订阅 store 数据变更。
 * 返回 version 版本号（数据变化时递增），页面据此重渲染后直接读取 store 最新数据。
 * 用法：
 *   const version = useStoreVersion();
 *   const cards = store.listCards();
 */
export function useStoreVersion(): number {
  const [version, setVersion] = useState(store.version);
  useEffect(() => store.subscribe(() => setVersion(store.version)), []);
  return version;
}
