import React, { useState } from 'react';
import { View, Text, Textarea, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { dbAdd } from '@/services/cloud';
import { store } from '@/store';
import { toast } from '@/utils/toast';
import styles from './index.module.scss';

/** 意见反馈：内容必填 + 联系方式选填，提交写入 feedback 集合（仅创建者可读写） */
const FeedbackPage: React.FC = () => {
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const text = content.trim();
    if (!text) {
      toast.info('请填写反馈内容');
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await dbAdd('feedback', {
        content: text,
        contact: contact.trim(),
        openId: store.userOpenId,
        _openid: store.userOpenId,
        createdAt: new Date().toISOString()
      });
      toast.success('感谢你的反馈');
      setTimeout(() => Taro.navigateBack(), 300);
    } catch (err) {
      console.error('[Feedback] 提交失败:', err);
      Taro.showToast({ title: '提交失败，请稍后重试', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className={styles.container}>
      <View className={styles.card}>
        <Text className={styles.label}>反馈内容</Text>
        <Textarea
          className={styles.textarea}
          value={content}
          placeholder="请描述你的问题或建议…"
          placeholderClass={styles.placeholder}
          maxlength={500}
          autoHeight
          onInput={e => setContent(e.detail.value)}
        />
        <Text className={styles.counter}>{`${content.length}/500`}</Text>
      </View>

      <View className={styles.card}>
        <Text className={styles.label}>联系方式（选填）</Text>
        <Input
          className={styles.input}
          value={contact}
          placeholder="手机号 / 微信号，方便我们回复你"
          placeholderClass={styles.placeholder}
          onInput={e => setContact(e.detail.value)}
        />
      </View>

      <View
        className={`${styles.submitBtn} ${content.trim() && !submitting ? '' : styles.submitBtnDisabled}`}
        onClick={content.trim() ? handleSubmit : undefined}
      >
        <Text className={styles.submitText}>{submitting ? '提交中…' : '提交反馈'}</Text>
      </View>
    </View>
  );
};

export default FeedbackPage;
