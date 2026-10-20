import React from 'react';
import { View, Text } from '@tarojs/components';
import classNames from 'classnames';
import styles from './index.module.scss';

export interface LoadingProps {
  /** 加载文案，默认"加载中..." */
  text?: string;
  /** 是否占满当前容器高度（页面级 loading 时开启） */
  fullScreen?: boolean;
  className?: string;
}

/** 行内加载组件：局部 loading 用此组件，全局遮罩 loading 用 utils/toast.ts 的 toast.loading */
const Loading: React.FC<LoadingProps> = ({ text = '加载中...', fullScreen = false, className }) => {
  return (
    <View className={classNames(styles.loading, fullScreen && styles.fullScreen, className)}>
      <View className={styles.spinner} />
      {text ? <Text className={styles.text}>{text}</Text> : null}
    </View>
  );
};

export default Loading;
