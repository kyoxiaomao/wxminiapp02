import React from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { store } from '@/store';
import { useStoreVersion } from '@/store/useStoreVersion';
import Avatar from '@/components/Avatar';
import { DEFAULT_MY_CARD_NAME } from '@/types';
import styles from './index.module.scss';

/** 姓名是否算未填：为空或还是首登占位名 */
const isNameBlank = (v?: string) => !v || !v.trim() || v === DEFAULT_MY_CARD_NAME;

/** 个人中心：顶部资料 → 会员权益横幅 → 功能入口行 → 更多服务 → 备案信息 */
const MinePage: React.FC = () => {
  useStoreVersion();
  const myCard = store.getMyCard();
  // 资料未完善：没有姓名或没有头像（与图谱节点红字「未完善」同一判定）
  const incomplete = !myCard || (isNameBlank(myCard.name) && !myCard.avatar);

  const openMyCard = () => {
    if (!myCard) {
      Taro.navigateTo({ url: '/pages/card/edit/index' });
      return;
    }
    // 未完善直达详情并聚焦姓名输入框（与图谱「未完善」节点同一条补全路径）
    Taro.navigateTo({
      url: `/pages/card/detail/index?id=${myCard.id}${incomplete ? '&focusName=1' : ''}`
    });
  };

  /** 在线客服：弹窗显示客服微信号，可一键复制 */
  const showCustomerService = () => {
    Taro.showModal({
      title: '在线客服',
      content: '客服微信号：wj19860401\n长按或点击「复制」添加客服微信',
      confirmText: '复制',
      cancelText: '关闭',
      success: res => {
        if (res.confirm) {
          Taro.setClipboardData({ data: 'wj19860401' }).then(() => Taro.showToast({ title: '微信号已复制', icon: 'none' }));
        }
      }
    });
  };

  const comingSoon = (name: string) => {
    Taro.showToast({ title: `${name}即将开放`, icon: 'none' });
  };

  const nameLabel = myCard ? (isNameBlank(myCard.name) ? '未命名' : myCard.name) : '未创建';

  /** 功能入口行（彩色圆图标） */
  const entries = [
    { key: 'card', icon: '📇', label: '我的名片', color: '#7d3c98', action: openMyCard },
    {
      key: 'graph',
      icon: '🕸️',
      label: '我的图谱',
      color: '#9b6bb0',
      action: () => Taro.switchTab({ url: '/pages/graph/index' }).catch(() => {})
    },
    { key: 'add', icon: '➕', label: '新建名片', color: '#e6a23c', action: () => Taro.navigateTo({ url: '/pages/card/edit/index' }) }
  ];

  /** 更多服务宫格 */
  const services = [
    { icon: '💬', label: '在线客服', action: showCustomerService },
    { icon: '📮', label: '意见反馈', action: () => Taro.navigateTo({ url: '/pages/feedback/index' }) },
    { icon: 'ℹ️', label: '关于我们', action: () => Taro.navigateTo({ url: '/pages/about/index?type=about' }) },
    { icon: '🔒', label: '隐私保护', action: () => Taro.navigateTo({ url: '/pages/about/index?type=privacy' }) }
  ];

  return (
    <View className={styles.container}>
      {/* 顶部：头像 + 姓名 + 签名（点击完善资料） */}
      <View className={styles.hero}>
        <View className={styles.heroRow} onClick={openMyCard}>
          <View className={styles.avatarWrap}>
            <Avatar src={myCard?.avatar} name={myCard?.name || '我'} size={140} />
            {incomplete ? (
              <View className={styles.avatarBadge}>
                <Text className={styles.avatarBadgeText}>未完善</Text>
              </View>
            ) : null}
          </View>
          <View className={styles.heroInfo}>
            <Text className={styles.name}>{nameLabel}</Text>
            <Text className={styles.signature}>{myCard?.phone || '点击完善我的名片资料'}</Text>
          </View>
        </View>
      </View>

      <View className={styles.body}>
        {/* 高级会员渐变横幅 */}
        <View className={styles.memberBanner} onClick={() => comingSoon('高级会员')}>
          <View className={styles.memberHead}>
            <Text className={styles.memberTitle}>👑 高级会员</Text>
            <Text className={styles.memberLink}>怎样升级 ›</Text>
          </View>
          <Text className={styles.memberDesc}>专属名片样式、更大图谱名额等权益即将到来</Text>
        </View>

        {/* 功能入口行 */}
        <View className={styles.entryCard}>
          {entries.map(e => (
            <View key={e.key} className={styles.entryItem} onClick={e.action}>
              <View className={styles.entryIcon} style={{ background: e.color }}>
                <Text className={styles.entryIconText}>{e.icon}</Text>
              </View>
              <Text className={styles.entryLabel}>{e.label}</Text>
            </View>
          ))}
        </View>

        {/* 更多服务宫格 */}
        <View className={styles.moreCard}>
          <Text className={styles.moreTitle}>更多服务</Text>
          <View className={styles.moreGrid}>
            {services.map(s => (
              <View key={s.label} className={styles.moreItem} onClick={s.action}>
                <Text className={styles.moreIcon}>{s.icon}</Text>
                <Text className={styles.moreLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text className={styles.icp}>浙ICP备2026012345号，杭州极星智能科技有限公司</Text>
      </View>
    </View>
  );
};

export default MinePage;
