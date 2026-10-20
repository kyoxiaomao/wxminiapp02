import React, { useEffect, useState } from 'react';
import { View, Text, Input, Textarea, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { store } from '@/store';
import Avatar from '@/components/Avatar';
import { toast } from '@/utils/toast';
import { CARD_TEMPLATES, ALL_PRESET_FIELDS, PRESET_FIELD_KEYS, getCardTemplate } from '@/mock/presets';
import { uploadFile } from '@/services/cloud';
import type { CardField, CardInput, CardTemplate } from '@/types';
import styles from './index.module.scss';

interface FormState {
  /** 卡片风格（只影响视觉） */
  template: CardTemplate;
  name: string;
  phone: string;
  company: string;
  title: string;
  /** 预置扩展字段当前值（全集：生日/微信/部门/邮箱/学校/院系/年级等），key 为字段 key */
  extra: Record<string, string>;
  /** 用户自建字段（保存前本地暂存） */
  userFields: CardField[];
  avatar: string;
  photos: string[];
  note: string;
}

const emptyForm: FormState = {
  template: 'company',
  name: '',
  phone: '',
  company: '',
  title: '',
  extra: {},
  userFields: [],
  avatar: '',
  photos: [],
  note: ''
};

/** 名片编辑页：新建（无 id）与编辑（带 id）双模式复用；布局与详情页一致，数据保存时才入库 */
const CardEditPage: React.FC = () => {
  const instance = Taro.getCurrentInstance();
  const cardId = instance?.router?.params?.id ?? '';
  const isEdit = !!cardId;

  // 模板下拉菜单 / 自定义字段添加行的临时状态
  const [tplOpen, setTplOpen] = useState(false);
  const [addingField, setAddingField] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState('');

  const [form, setForm] = useState<FormState>(() => {
    if (!cardId) return emptyForm;
    const card = store.getCard(cardId);
    if (!card) return emptyForm;
    // 回填模板预置字段已有值 + 用户自建字段
    const extra: Record<string, string> = {};
    const userFields: CardField[] = [];
    (card.customFields ?? []).forEach(f => {
      if (PRESET_FIELD_KEYS.has(f.key)) extra[f.key] = f.value;
      else userFields.push({ ...f });
    });
    return {
      template: card.template,
      name: card.name,
      phone: card.phone,
      company: card.company,
      title: card.title,
      extra,
      userFields,
      avatar: card.avatar,
      photos: [...card.photos],
      note: card.note
    };
  });

  useEffect(() => {
    Taro.setNavigationBarTitle({ title: isEdit ? '编辑名片' : '新建名片' });
    if (cardId && !store.getCard(cardId)) {
      toast.error('名片不存在');
      setTimeout(() => Taro.navigateBack(), 300);
    }
  }, [cardId, isEdit]);

  const curTpl = getCardTemplate(form.template);

  const patch = (p: Partial<FormState>) => setForm(f => ({ ...f, ...p }));

  /** 模板预置字段输入（含头部称谓 role） */
  const patchExtra = (key: string, value: string) =>
    setForm(f => ({ ...f, extra: { ...f.extra, [key]: value } }));

  /** 用户自建字段输入 */
  const patchUserField = (key: string, value: string) =>
    setForm(f => ({ ...f, userFields: f.userFields.map(x => (x.key === key ? { ...x, value } : x)) }));

  const confirmAddField = () => {
    const label = newFieldLabel.trim();
    if (!label) {
      toast.info('请输入字段名');
      return;
    }
    setForm(f => ({
      ...f,
      userFields: [...f.userFields, { key: `f-${Date.now().toString(36)}`, label, icon: '🏷️', value: '' }]
    }));
    setNewFieldLabel('');
    setAddingField(false);
  };

  const chooseAvatar = () => {
    Taro.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async res => {
        const file = res.tempFiles[0];
        if (!file) return;
        try {
          const fileID = await uploadFile(`avatars/${cardId || 'new'}-${Date.now().toString(36)}.png`, file.tempFilePath);
          patch({ avatar: fileID });
        } catch (err) {
          console.error('[CardEdit] 头像上传失败：', err);
          toast.error('头像上传失败');
        }
      },
      fail: err => console.error('[CardEdit] 选择头像失败：', err)
    });
  };

  const choosePhotos = () => {
    Taro.chooseMedia({
      count: Math.max(1, 9 - form.photos.length),
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async res => {
        if (!res.tempFiles.length) return;
        try {
          const fileIDs = await Promise.all(
            res.tempFiles.map((f, i) =>
              uploadFile(`photos/${cardId || 'new'}-${Date.now().toString(36)}-${i}.png`, f.tempFilePath)
            )
          );
          patch({ photos: [...form.photos, ...fileIDs] });
        } catch (err) {
          console.error('[CardEdit] 照片上传失败：', err);
          toast.error('照片上传失败');
        }
      },
      fail: err => console.error('[CardEdit] 选择照片失败：', err)
    });
  };

  const removePhoto = (index: number) => {
    patch({ photos: form.photos.filter((_, i) => i !== index) });
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.info('请填写姓名');
      return;
    }
    // 全字段保存：预置字段全集（去掉称谓——称谓归图谱节点）+ 用户自建字段
    const oldFields = (isEdit ? store.getCard(cardId)?.customFields : undefined) ?? [];
    const merged: CardField[] = ALL_PRESET_FIELDS.filter(d => d.key !== 'role').map(d => ({
      ...d,
      value: form.extra[d.key] ?? oldFields.find(f => f.key === d.key)?.value ?? ''
    }));
    // 旧版称谓 role 原样保留（数据不删，编辑入口已归图谱节点）；非预置字段由 userFields 携带
    const preserved = oldFields.filter(f => f.key === 'role');
    const userFields = form.userFields.filter(f => !PRESET_FIELD_KEYS.has(f.key));
    const customFields: CardField[] = [...merged, ...preserved, ...userFields];
    const payload: CardInput = {
      name: form.name.trim(),
      template: form.template,
      customFields,
      phone: form.phone.trim(),
      company: form.company.trim(),
      title: form.title.trim(),
      avatar: form.avatar,
      photos: form.photos,
      note: form.note.trim(),
      isMe: isEdit ? store.getCard(cardId)?.isMe ?? false : false,
      createdAt: isEdit ? store.getCard(cardId)?.createdAt ?? '' : new Date().toISOString()
    };
    if (isEdit) {
      store.updateCard(cardId, payload);
      console.info('[CardEdit] 更新名片：%s', cardId);
      toast.success('已保存');
      setTimeout(() => Taro.navigateBack(), 300);
    } else {
      // 新建：等云端落库成功才算保存成功，失败留在本页暴露问题
      try {
        await store.createCard(payload);
        console.info('[CardEdit] 新建名片：%s', payload.name);
        toast.success('已保存');
        setTimeout(() => Taro.navigateBack(), 300);
      } catch (err) {
        console.error('[CardEdit] 新建名片失败:', err);
        Taro.showToast({ title: '保存失败，云端未写入', icon: 'none' });
      }
    }
  };

  const handleDelete = () => {
    Taro.showModal({
      title: '删除名片',
      content: `确定删除「${form.name}」吗？图谱中引用 TA 的节点将变为匿名节点。`,
      confirmColor: '#f53f3f',
      success: res => {
        if (!res.confirm) return;
        store.deleteCard(cardId);
        toast.success('已删除');
        setTimeout(() => Taro.navigateBack(), 300);
      }
    });
  };

  const canSave = form.name.trim().length > 0;

  /** 信息行：图标 + 标签 + 行内输入（与详情页一致的直接编辑样式） */
  const renderRow = (
    key: string,
    icon: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    options?: { removable?: boolean }
  ) => (
    <View className={styles.row} key={key}>
      <Text className={styles.rowIcon}>{icon}</Text>
      <View className={styles.rowBody}>
        <Text className={styles.rowLabel}>{label}</Text>
        <Input
          className={styles.input}
          value={value}
          placeholder="未填写"
          placeholderClass={styles.placeholder}
          onInput={e => onChange(e.detail.value)}
        />
      </View>
      {options?.removable ? (
        <View
          className={styles.fieldRemove}
          onClick={() => setForm(f => ({ ...f, userFields: f.userFields.filter(x => x.key !== key) }))}
        >
          <Text className={styles.fieldRemoveText}>×</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View className={styles.container}>
      <View className={styles.mainCard}>
        {/* 右上角风格下拉：切换卡片视觉风格 */}
        <View className={styles.tplDropdown}>
          <View className={styles.tplBtn} style={{ background: curTpl.colorBg }} onClick={() => setTplOpen(o => !o)}>
            <Text className={styles.tplBtnText} style={{ color: curTpl.color }}>
              {curTpl.icon} {curTpl.label}
            </Text>
            <Text className={styles.tplBtnArrow} style={{ color: curTpl.color }}>▾</Text>
          </View>
          {tplOpen ? (
            <View className={styles.tplMenu}>
              {CARD_TEMPLATES.map(t => (
                <View
                  key={t.key}
                  className={`${styles.tplMenuItem} ${form.template === t.key ? styles.tplMenuItemActive : ''}`}
                  onClick={() => {
                    patch({ template: t.key });
                    setTplOpen(false);
                  }}
                >
                  <Text className={styles.tplMenuItemText}>
                    <Text style={{ color: t.color }}>●</Text> {t.label}
                  </Text>
                  {form.template === t.key ? <Text className={styles.tplMenuCheck}>✓</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {/* 头部：头像左 / 信息右（与详情页一致） */}
        <View className={styles.head}>
          <View className={styles.avatarWrap} onClick={chooseAvatar}>
            <Avatar src={form.avatar} name={form.name || '新'} size={140} />
            <View className={styles.avatarEdit}>
              <Text className={styles.avatarEditText}>换头像</Text>
            </View>
          </View>
          <View className={styles.headInfo}>
            <Input
              className={styles.nameInput}
              value={form.name}
              placeholder="姓名"
              placeholderClass={styles.placeholder}
              onInput={e => patch({ name: e.detail.value })}
            />
            {/* 称谓归图谱节点（名片详情页按图谱设置），此处不再编辑 */}
          </View>
        </View>
      </View>

      {/* 模板菜单展开时的透明遮罩：点击空白处收起 */}
      {tplOpen ? <View className={styles.tplMask} onClick={() => setTplOpen(false)} /> : null}

      <View className={styles.section}>
        {renderRow('phone', '📞', '电话', form.phone, v => patch({ phone: v }))}
        {/* 公司/职位全风格恒显 */}
        {renderRow('company', '🏢', '公司', form.company, v => patch({ company: v }))}
        {renderRow('title', '💼', '职位', form.title, v => patch({ title: v }))}
        {/* 预置字段全集（称谓除外，归图谱节点）：生日/微信/部门/邮箱/学校/院系/年级 */}
        {ALL_PRESET_FIELDS.filter(f => f.key !== 'role').map(f =>
          renderRow(f.key, f.icon, f.label, form.extra[f.key] ?? '', v => patchExtra(f.key, v))
        )}
        {/* 用户自建字段 */}
        {form.userFields.map(f => renderRow(f.key, f.icon, f.label, f.value, v => patchUserField(f.key, v), { removable: true }))}
        {/* 添加自定义字段 */}
        {addingField ? (
          <View className={styles.addRow}>
            <Input
              className={styles.addRowInput}
              value={newFieldLabel}
              placeholder="字段名，如：微信"
              placeholderClass={styles.placeholder}
              focus
              onInput={e => setNewFieldLabel(e.detail.value)}
            />
            <Text className={styles.addRowOk} onClick={confirmAddField}>
              添加
            </Text>
            <Text
              className={styles.addRowCancel}
              onClick={() => {
                setAddingField(false);
                setNewFieldLabel('');
              }}
            >
              取消
            </Text>
          </View>
        ) : (
          <View className={styles.addFieldRow} onClick={() => setAddingField(true)}>
            <Text className={styles.addFieldText}>＋ 自定义字段</Text>
          </View>
        )}
      </View>

      <View className={styles.section}>
        <View className={styles.row}>
          <Text className={styles.rowIcon}>🖼️</Text>
          <View className={styles.rowBody}>
            <Text className={styles.rowLabel}>照片（{form.photos.length}）</Text>
          </View>
        </View>
        <View className={styles.photoGrid}>
          {form.photos.map((url, i) => (
            <View key={`${url}-${i}`} className={styles.photoWrap}>
              <Image className={styles.photo} src={url} mode="aspectFill" />
              <View className={styles.photoRemove} onClick={() => removePhoto(i)}>
                <Text className={styles.photoRemoveText}>×</Text>
              </View>
            </View>
          ))}
          {form.photos.length < 9 ? (
            <View className={styles.photoAdd} onClick={choosePhotos}>
              <Text className={styles.photoAddText}>＋</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View className={styles.section}>
        <View className={styles.row}>
          <Text className={styles.rowIcon}>📝</Text>
          <View className={styles.rowBody}>
            <Text className={styles.rowLabel}>备注</Text>
          </View>
        </View>
        <Textarea
          className={styles.noteInput}
          value={form.note}
          placeholder="未填写"
          placeholderClass={styles.placeholder}
          maxlength={200}
          autoHeight
          onInput={e => patch({ note: e.detail.value })}
        />
      </View>

      <View className={styles.actionBar}>
        {isEdit ? (
          <View className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={handleDelete}>
            <Text>删除</Text>
          </View>
        ) : null}
        <View
          className={`${styles.actionBtn} ${styles.saveBtn} ${canSave ? '' : styles.saveBtnDisabled}`}
          onClick={canSave ? handleSave : undefined}
        >
          <Text>保存</Text>
        </View>
      </View>
    </View>
  );
};

export default CardEditPage;
