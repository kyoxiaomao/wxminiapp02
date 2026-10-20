import React from 'react';
import { View, Text, Input } from '@tarojs/components';
import classNames from 'classnames';
import styles from './index.module.scss';

export interface SearchBarProps {
  /** 输入值 */
  value: string;
  /** 占位文案 */
  placeholder?: string;
  /** 输入回调 */
  onInput: (value: string) => void;
  /** 点击键盘搜索/完成回调 */
  onConfirm?: (value: string) => void;
  /** 点击清除按钮回调 */
  onClear?: () => void;
  /** 是否自动聚焦 */
  focus?: boolean;
  className?: string;
}

/** 搜索栏：名片按人名搜索复用 */
const SearchBar: React.FC<SearchBarProps> = ({
  value,
  placeholder = '搜索',
  onInput,
  onConfirm,
  onClear,
  focus = false,
  className
}) => {
  const handleClear = () => {
    if (onClear) {
      onClear();
    } else {
      onInput('');
    }
  };

  return (
    <View className={classNames(styles.searchBar, className)}>
      <Text className={styles.searchIcon}>🔍</Text>
      <Input
        className={styles.input}
        value={value}
        placeholder={placeholder}
        placeholderClass={styles.placeholder}
        focus={focus}
        confirmType="search"
        onInput={e => onInput(e.detail.value)}
        onConfirm={e => onConfirm && onConfirm(e.detail.value)}
      />
      {value ? (
        <Text className={styles.clearIcon} onClick={handleClear}>
          ✕
        </Text>
      ) : null}
    </View>
  );
};

export default SearchBar;
