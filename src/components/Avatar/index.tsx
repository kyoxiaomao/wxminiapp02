import React from 'react';
import { View, Text, Image } from '@tarojs/components';
import classNames from 'classnames';
import styles from './index.module.scss';

/** 头像尺寸预设（rpx）——用 SCSS 类控制尺寸，避免内联 style rpx 在 H5 预览不生效 */
export type AvatarSize = 56 | 72 | 96 | 120 | 140 | 160;

const SIZE_CLASS: Record<AvatarSize, string> = {
  56: styles.size56,
  72: styles.size72,
  96: styles.size96,
  120: styles.size120,
  140: styles.size140,
  160: styles.size160
};

export interface AvatarProps {
  /** 头像图片地址；为空时显示姓名首字母占位 */
  src?: string;
  name: string;
  /** 直径（rpx），默认 96 */
  size?: AvatarSize;
  className?: string;
}

/** 头像组件：有名片头像显示图片，否则用姓名首字生成紫色占位符 */
const Avatar: React.FC<AvatarProps> = ({ src, name, size = 96, className }) => {
  const sizeClass = SIZE_CLASS[size];
  if (src) {
    return (
      <Image
        className={classNames(styles.avatar, sizeClass, className)}
        src={src}
        mode="aspectFill"
      />
    );
  }
  return (
    <View className={classNames(styles.avatar, styles.placeholder, sizeClass, className)}>
      <Text className={styles.initial}>{name.slice(0, 1) || '?'}</Text>
    </View>
  );
};

export default Avatar;
