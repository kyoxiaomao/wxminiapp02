import React from 'react';
import { View, Text } from '@tarojs/components';
import classNames from 'classnames';
import styles from './index.module.scss';

export interface EmptyProps {
  /** 主提示文案 */
  title?: string;
  /** 辅助描述文案 */
  description?: string;
  /** 自定义图标（emoji 字符），默认 📭 */
  icon?: string;
  className?: string;
}

/** 空态占位组件：列表/页面无数据时展示 */
const Empty: React.FC<EmptyProps> = ({ title = '暂无数据', description, icon = '📭', className }) => {
  return (
    <View className={classNames(styles.empty, className)}>
      <Text className={styles.icon}>{icon}</Text>
      <Text className={styles.title}>{title}</Text>
      {description ? <Text className={styles.description}>{description}</Text> : null}
    </View>
  );
};

export default Empty;
