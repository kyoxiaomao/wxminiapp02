import React, { useRef, useState } from 'react';
import { View, Text, Input, Textarea, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { store } from '@/store';
import Avatar from '@/components/Avatar';
import { toast } from '@/utils/toast';
import { CARD_TEMPLATES, ALL_PRESET_FIELDS, getCardTemplate } from '@/mock/presets';
import { uploadFile } from '@/services/cloud';
import { MAX_CARD_PHOTOS, type CardField, type CardInput, type CardTemplate } from '@/types';
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

/** 新建名片页：布局与详情页一致，数据保存时才入库（编辑已有名片在详情页直接改） */
const CardEditPage: React.FC = () => {
  // 模板下拉菜单 / 自定义字段添加行的临时状态
  const [tplOpen, setTplOpen] = useState(false);
  const [addingField, setAddingField] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState('');

  const [form, setForm] = useState<FormState>(emptyForm);
  // 保存中：等云端落库期间忽略再次点击，避免建出两张一样的名片
  const savingRef = useRef(false);

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
          const fileID = await uploadFile(`avatars/new-${Date.now().toString(36)}.png`, file.tempFilePath);
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
      count: Math.max(1, MAX_CARD_PHOTOS - form.photos.length),
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async res => {
        if (!res.tempFiles.length) return;
        try {
          const fileIDs = await Promise.all(
            res.tempFiles.map((f, i) =>
              uploadFile(`photos/new-${Date.now().toString(36)}-${i}.png`, f.tempFilePath)
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
    if (savingRef.current) return;
    savingRef.current = true;
    // 全字段保存：预置字段全集（去掉称谓——称谓归图谱节点）+ 用户自建字段
    const presetFields: CardField[] = ALL_PRESET_FIELDS.filter(d => d.key !== 'role').map(d => ({
      ...d,
      value: form.extra[d.key] ?? ''
    }));
    const customFields: CardField[] = [...presetFields, ...form.userFields];
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
      isMe: false,
      createdAt: new Date().toISOString()
    };
    // 等云端落库成功才算保存成功，失败留在本页暴露问题
    try {
      await store.createCard(payload);
      console.info('[CardEdit] 新建名片：%s', payload.name);
      toast.success('已保存');
      setTimeout(() => Taro.navigateBack(), 300);
    } catch (err) {
      savingRef.current = false;
      console.error('[CardEdit] 新建名片失败:', err);
      Taro.showToast({ title: '保存失败，云端未写入', icon: 'none' });
    }
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
          {form.photos.length < MAX_CARD_PHOTOS ? (
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
