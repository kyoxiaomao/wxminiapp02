import React, { useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import styles from './index.module.scss';

/** 隐私政策条款（静态文案） */
const PRIVACY_SECTIONS = [
  {
    title: '我们收集的信息',
    items: [
      '手机号：经你主动点击「一键授权登录」后由微信官方授权接口换取，用于创建和登录你的账号。',
      '头像与昵称：经你主动点击授权按钮后获取，用于完善你的名片资料。',
      '名片与图谱数据：你填写的姓名、电话、公司、图谱关系等内容，存储于微信云开发服务。',
      '意见反馈内容：你主动提交的反馈文字与选填联系方式。'
    ]
  },
  {
    title: '信息的存储与安全',
    items: [
      '所有数据存储于腾讯云开发（微信云开发）服务，按微信平台安全规范加密传输与存储。',
      '名片数据按账号隔离，仅你本人可读写自己创建的内容。',
      '你分享名片时，被分享人仅能查看你主动分享的内容；你可随时撤回分享。'
    ]
  },
  {
    title: '我们不做的事情',
    items: [
      '不读取你的手机通讯录。',
      '不获取你的微信好友关系。',
      '不向任何第三方出售或共享你的个人信息。'
    ]
  },
  {
    title: '你的权利',
    items: [
      '你可以随时编辑、删除自己的名片与图谱数据。',
      '如需注销账号并清除全部数据，可通过意见反馈联系我们处理。'
    ]
  }
];

/** 关于我们 / 隐私保护：单页按 type 参数切换内容 */
const AboutPage: React.FC = () => {
  const instance = Taro.getCurrentInstance();
  const type = instance?.router?.params?.type ?? 'about';
  const isPrivacy = type === 'privacy';

  useEffect(() => {
    Taro.setNavigationBarTitle({ title: isPrivacy ? '隐私保护' : '关于我们' });
  }, [isPrivacy]);

  return (
    <View className={styles.container}>
      {!isPrivacy ? (
        <View>
          <View className={styles.heroCard}>
            <Text className={styles.logo}>📇</Text>
            <Text className={styles.productName}>名片图谱</Text>
            <Text className={styles.slogan}>让每一段关系都有迹可循</Text>
            <Text className={styles.version}>版本 1.0.0</Text>
          </View>

          <View className={styles.card}>
            <Text className={styles.cardTitle}>产品简介</Text>
            <Text className={styles.paragraph}>
              名片图谱是一款以「人」为中心的关系管理工具。你可以创建自己的电子名片，用家族、公司等图谱组织
              关系网络，并通过分享名片与他人互换联系方式。名片支持「活名片」机制——对方更新名片后，你这里
              自动同步最新内容。
            </Text>
          </View>

          <View className={styles.card}>
            <Text className={styles.cardTitle}>开发者信息</Text>
            <View className={styles.infoRow}>
              <Text className={styles.infoLabel}>开发者</Text>
              <Text className={styles.infoValue}>杭州极星智能科技有限公司</Text>
            </View>
            <View className={styles.infoRow}>
              <Text className={styles.infoLabel}>备案号</Text>
              <Text className={styles.infoValue}>浙ICP备2026012345号</Text>
            </View>
          </View>
        </View>
      ) : (
        <View>
          <View className={styles.card}>
            <Text className={styles.paragraph}>
              名片图谱（以下简称「我们」）尊重并保护你的个人信息。本政策说明我们如何收集、使用和保护你的信息。
            </Text>
          </View>
          {PRIVACY_SECTIONS.map(s => (
            <View key={s.title} className={styles.card}>
              <Text className={styles.cardTitle}>{s.title}</Text>
              {s.items.map((item, i) => (
                <View key={i} className={styles.bulletRow}>
                  <Text className={styles.bulletDot}>•</Text>
                  <Text className={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

export default AboutPage;
