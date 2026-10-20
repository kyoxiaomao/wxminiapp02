import React, { useState } from 'react';
import { View, Text, Button, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { store } from '@/store';
import { completeOnboarding, setDemoMode } from '@/services/auth';
import { callFunction } from '@/services/cloud';
import { toast } from '@/utils/toast';
import type { CardInput, UserProfile } from '@/types';
import styles from './index.module.scss';

/** 手机号授权事件（<Button openType="getPhoneNumber"> 返回一次性 code） */
interface GetPhoneNumberEvent {
  detail: { code?: string; errMsg?: string };
}

/**
 * 首登建名片引导：底部抽屉式弹窗，仅一个「一键授权」按钮
 * - 点击 → 微信原生授权弹窗（选手机号）→ 云函数换取手机号 → 创建我的名片直接进入
 * - 头像/昵称/姓名/微信号不在此收集（微信无静默获取接口），创建后可在名片里完善
 */
const OnboardingPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  // 账号密码登录（平台审核用）：常显输入框
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [accountLoading, setAccountLoading] = useState(false);

  const myCard = store.getMyCard();

  const goGraph = () => {
    Taro.switchTab({ url: '/pages/graph/index' }).catch(err =>
      console.error('[Onboarding] 返回图谱页失败:', err)
    );
  };

  /** 引导完成入口：分享落地来的打开被分享的名片详情，否则进图谱首页 */
  const finishAndEnter = () => {
    const target = store.onboardRedirect;
    store.onboardRedirect = null;
    if (target) {
      console.info('[Onboarding] 分享落地：打开被分享的名片详情');
      Taro.redirectTo({ url: target }).catch(err => {
        console.error('[Onboarding] 打开名片详情失败:', err);
        goGraph();
      });
    } else {
      goGraph();
    }
  };

  /** 账号密码登录（平台审核用）：验证通过后服务端把演示账号数据复制到本人名下 */
  const handleAccountLogin = async () => {
    const acc = account.trim();
    const pwd = password;
    if (!acc || !pwd) {
      toast.info('请输入账号和密码');
      return;
    }
    if (accountLoading) return;
    setAccountLoading(true);
    toast.loading('登录中…');
    try {
      await callFunction('accountLogin', { account: acc, password: pwd });
      // 进入演示模式：读写共享 demo_* 集合（一份演示数据所有测试账号共用）并本地记住
      setDemoMode(true);
      await store.loadCardsFromCloud();
      await store.loadGraphsFromCloud();
      toast.hideLoading();
      toast.success('登录成功，已载入演示数据');
      setTimeout(finishAndEnter, 300);
    } catch (err) {
      console.error('[Onboarding] 账号密码登录失败:', err);
      toast.hideLoading();
      Taro.showToast({ title: String((err as Error)?.message ?? '登录失败'), icon: 'none' });
    } finally {
      setAccountLoading(false);
    }
  };

  /** 创建我的名片：建/更新 isMe 卡 → 播种默认图谱 → 写 users（onboarded=true） */
  const createMyCard = async (phone: string) => {
    toast.loading('正在创建…');
    try {
      let my = myCard;
      if (myCard) {
        // 已有「我的名片」（如开发期认领的占位卡）：只补手机号，其余字段保留
        store.updateCard(myCard.id, { phone: phone || myCard.phone || '' });
        console.info('[Onboarding] 我的名片已更新（%s）', myCard.id);
      } else {
        const payload: CardInput = {
          // 姓名留空：圈内显示「未命名」+ 红字未完善，单击节点直达详情补姓名
          name: '',
          template: 'custom',
          customFields: [],
          phone,
          company: '',
          title: '',
          avatar: '',
          photos: [],
          note: '',
          isMe: true,
          createdAt: new Date().toISOString()
        };
        my = await store.createCard(payload);
        console.info('[Onboarding] 我的名片已创建（姓名待填）');
      }
      // 新用户落地图谱页要有内容：一个图谱都没有时播种默认「我的图谱」，中间放「我」节点
      if (my && store.listGraphs().length === 0) {
        const g = store.createGraph({
          name: '我的图谱',
          type: 'custom',
          typeLabel: '',
          coverColor: '#d9c9dd',
          createdAt: new Date().toISOString(),
          avatar: ''
        });
        store.createNode({ graphId: g.id, cardId: my.id, role: '我', gen: 1 });
        console.info('[Onboarding] 已播种默认图谱「我的图谱」（%s），「我」节点居中', g.id);
      }
      const profile: UserProfile = { nickname: '', name: '', avatar: '', phone, wechat: '' };
      await completeOnboarding(profile);
      toast.hideLoading();
      toast.success('我的名片已创建');
      setTimeout(finishAndEnter, 300);
    } catch (err) {
      // 失败留在本页暴露问题（不跳走、不假成功）
      console.error('[Onboarding] 创建我的名片失败:', err);
      toast.hideLoading();
      Taro.showToast({ title: '创建失败，请重试', icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

  /** 一键授权：授权 code → 云函数换取手机号 → 直接创建名片进入 */
  const onGetPhoneNumber = async (e: GetPhoneNumberEvent) => {
    const code = e.detail?.code;
    if (!code) {
      console.info('[Onboarding] 授权被拒绝:', e.detail?.errMsg);
      toast.info('未完成授权，可稍后在名片里完善资料');
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      const data = await callFunction<{ phoneNumber: string; countryCode: string }>('getPhoneNumber', { code });
      console.info('[Onboarding] 授权成功，手机号已换取');
      await createMyCard(data.phoneNumber);
    } catch (err) {
      console.error('[Onboarding] 获取手机号失败:', err);
      toast.hideLoading();
      Taro.showToast({ title: '授权失败，请重试', icon: 'none' });
      setLoading(false);
    }
  };

  return (
    <View className={styles.container}>
      <View className={styles.mask} />
      <View className={styles.drawer}>
        <View className={styles.handle} />
        <Text className={styles.title}>名片图谱</Text>
        <View className={styles.titleBar} />

        {/* 账号密码登录（平台审核用）：常显 */}
        <View className={styles.accountForm}>
          <Input
            className={styles.accountInput}
            value={account}
            placeholder="账号"
            placeholderClass={styles.placeholder}
            onInput={e => setAccount(e.detail.value)}
          />
          <Input
            className={styles.accountInput}
            password
            value={password}
            placeholder="密码"
            placeholderClass={styles.placeholder}
            onInput={e => setPassword(e.detail.value)}
          />
          <View
            className={`${styles.accountBtn} ${accountLoading ? styles.authBtnDisabled : ''}`}
            onClick={handleAccountLogin}
          >
            <Text className={styles.accountBtnText}>{accountLoading ? '登录中…' : '登录'}</Text>
          </View>
        </View>

        <Button
          className={`${styles.authBtn} ${loading ? styles.authBtnDisabled : ''}`}
          openType="getPhoneNumber"
          onGetPhoneNumber={onGetPhoneNumber}
        >
          <Text className={styles.authBtnText}>{loading ? '创建中…' : '一键授权登录'}</Text>
        </Button>

        <Text className={styles.icp}>浙ICP备2026012345号，杭州极星智能科技有限公司</Text>
      </View>
    </View>
  );
};

export default OnboardingPage;
