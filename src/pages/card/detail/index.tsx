import React, { useState, useEffect } from 'react';
import { View, Text, Image, Input, Textarea, Button } from '@tarojs/components';
import Taro, { useShareAppMessage } from '@tarojs/taro';
import { store } from '@/store';
import { useStoreVersion } from '@/store/useStoreVersion';
import Avatar from '@/components/Avatar';
import { toast } from '@/utils/toast';
import { CARD_TEMPLATES, ALL_PRESET_FIELDS, PRESET_FIELD_KEYS, getCardTemplate } from '@/mock/presets';
import { uploadFile } from '@/services/cloud';
import { GRAPH_TYPE_LABELS, DEFAULT_MY_CARD_NAME, type CardField, type CardTemplate } from '@/types';
import styles from './index.module.scss';

/** 名片详情：直接编辑 + 风格切换 + 图谱称谓 + 分享 */
const CardDetailPage: React.FC = () => {
  const instance = Taro.getCurrentInstance();
  const cardId = instance?.router?.params?.id ?? '';
  /** 从图谱「未完善」节点跳入：自动聚焦姓名输入框（光标闪烁提示输入姓名） */
  const focusName = instance?.router?.params?.focusName === '1';
  useStoreVersion();
  // 实际渲染的本地卡片 id：分享落地参数是源卡 id，解析到本地引用条后指向引用条
  const [viewId, setViewId] = useState(cardId);
  const card = store.getCard(viewId);

  // 自定义字段添加行的临时状态
  const [addingField, setAddingField] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  // 风格下拉菜单展开状态
  const [tplMenuOpen, setTplMenuOpen] = useState(false);
  // 图谱下拉菜单展开状态（选中图谱决定称谓编辑目标）
  const [graphMenuOpen, setGraphMenuOpen] = useState(false);
  // 当前选中图谱 id：决定称谓编辑目标（缺省用第一个图谱）
  const [graphId, setGraphId] = useState<string | null>(null);
  // 姓名输入框聚焦：延迟到页面跳转动画结束后再生效，否则 focus 会被吞掉
  const [nameFocused, setNameFocused] = useState(false);
  useEffect(() => {
    if (!focusName) return;
    // 旧数据的占位名（「微信用户」）清空，让输入框直接显示「输入姓名」提示
    const c = store.getCard(cardId);
    if (c && c.name === DEFAULT_MY_CARD_NAME) store.updateCard(c.id, { name: '' });
    const t = setTimeout(() => setNameFocused(true), 350);
    return () => clearTimeout(t);
  }, [focusName]);

  // 活名片链路：本地无此卡=别人分享来的（自动收下）；是活名片=每次打开拉源卡最新
  const [loadState, setLoadState] = useState<'ok' | 'loading' | 'error'>(card ? 'ok' : 'loading');
  // 编辑态下的「预览」：临时切换到浏览态，看别人看到的样子
  const [preview, setPreview] = useState(false);
  // 收名片失败的诊断信息（弹窗展示 + 可复制给开发排查）
  const [errInfo, setErrInfo] = useState('');
  useEffect(() => {
    let dead = false;
    const run = async () => {
      // 等启动登录 + 卡片载入完成再收名片：落地页可能先于二者渲染，
      // 未载入就查不到已收过的引用条会重复收下（cardsReady 也一起等）
      for (let i = 0; i < 50 && (!store.userOpenId || !store.cardsReady) && !dead; i++) {
        await new Promise(r => setTimeout(r, 100));
      }
      if (dead) return;
      const direct = store.getCard(cardId);
      // 自己的名片：编辑态直接展示
      if (direct && direct.source !== 'shared') {
        setLoadState('ok');
        return;
      }
      // 分享落地（参数是源卡 id）：已收过 → 显示本地引用条并拉最新；未收过 → 自动收下
      const local = direct ?? store.listCards().find(c => c.refCardId === cardId);
      if (local) {
        if (!dead) {
          setViewId(local.id);
          setLoadState('ok');
        }
        store.markCardSeen(local.id); // 点开详情即视为已读，清列表「有更新」红点
        store.refreshSharedCard(local.id).catch(err => console.error('[CardDetail] 活名片刷新失败:', err));
        return;
      }
      setLoadState('loading');
      try {
        const received = await store.receiveSharedCard(cardId);
        if (!dead) {
          setViewId(received.id);
          setLoadState('ok');
        }
      } catch (err) {
          const msg = String((err as Error)?.message ?? err);
          console.error('[CardDetail] 收下分享名片失败:', err);
          const diag = [
            '[收名片诊断]',
            `时间: ${new Date().toLocaleString()}`,
            `cardId: ${cardId}`,
            `openid: ${store.userOpenId || '未就绪'}`,
            `错误: ${msg}`
          ].join('\n');
          if (!dead) {
            setErrInfo(diag);
            setLoadState('error');
            Taro.showModal({
              title: '收名片失败',
              content: msg,
              confirmText: '复制详情',
              cancelText: '关闭',
              success: r => {
                if (r.confirm) {
                  Taro.setClipboardData({ data: diag }).then(() => toast.success('诊断信息已复制'));
                }
              }
            });
          }
        }
    };
    run();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  // 转发名片：路径直达本详情页；转发即公开（getCard 云函数只放行 shared 卡）；转发的永远是源卡 id
  useShareAppMessage(() => {
    const c = store.getCard(viewId);
    if (c && c.source !== 'shared') store.updateCard(c.id, { shared: true });
    return {
      title: `${c?.name || '名片'}的名片`,
      path: `/pages/card/detail/index?id=${c?.refCardId || c?.id || cardId}`
    };
  });

  if (!card) {
    return (
      <View className={styles.container}>
        <View className={styles.mainCard}>
          <Text className={styles.name}>{loadState === 'loading' ? '正在加载名片…' : '名片不存在或未分享'}</Text>
          {errInfo ? (
            <View className={styles.errBox}>
              <Text className={styles.errText} selectable>
                {errInfo}
              </Text>
              <View
                className={styles.errCopyBtn}
                onClick={() => {
                  Taro.setClipboardData({ data: errInfo }).then(() => toast.success('诊断信息已复制'));
                }}
              >
                <Text className={styles.errCopyText}>复制诊断信息</Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  /** 修改权限：自己的名片可编辑（编辑态）；收到的活名片无权限（浏览态） */
  const canEdit = card.source !== 'shared';
  /** 浏览态：无修改权限，或编辑态点了「预览」 */
  const readonly = !canEdit || preview;

  const graphs = store.listGraphsOfCard(card.id);
  const tpl = getCardTemplate(card.template);
  const fields: CardField[] = card.customFields ?? [];

  /** 当前选中图谱：决定称谓编辑目标（默认第一个图谱；无图谱时为 null） */
  const activeGraph = graphs.find(g => g.id === graphId) ?? graphs[0];
  /** 名片在当前图谱中的节点（称谓的权威存放处） */
  const activeNode = activeGraph
    ? store.listNodes(activeGraph.id).find(n => n.cardId === card.id)
    : undefined;

  /** 字段全量展示：预置字段全集（有值的，称谓除外——称谓归图谱节点）+ 用户自建 */
  const visibleFields: CardField[] = [
    ...ALL_PRESET_FIELDS.map(def => fields.find(f => f.key === def.key)).filter(
      (f): f is CardField => !!f
    ),
    ...fields.filter(f => !PRESET_FIELD_KEYS.has(f.key))
  ].filter(f => f.key !== 'role');

  /** 字段直接编辑，输入即保存 */
  const patchText = (field: 'name' | 'phone' | 'company' | 'title' | 'note', value: string) => {
    store.updateCard(card.id, { [field]: value });
  };

  /** 切换风格：只改视觉（色条/主题色），字段不受影响 */
  const applyTemplate = (key: CardTemplate) => {
    if (key === card.template) return;
    store.updateCard(card.id, { template: key });
  };

  const patchFieldValue = (key: string, value: string) => {
    store.updateCard(card.id, {
      customFields: fields.map(f => (f.key === key ? { ...f, value } : f))
    });
  };

  /** 称谓编辑：写当前图谱节点的 role（每个图谱各自独立的称谓） */
  const patchNodeRole = (value: string) => {
    if (!activeNode) return;
    store.updateNode(activeNode.id, { role: value });
  };

  const confirmAddField = () => {
    const label = newFieldLabel.trim();
    if (!label) {
      toast.info('请输入字段名');
      return;
    }
    store.updateCard(card.id, {
      customFields: [...fields, { key: `f-${Date.now().toString(36)}`, label, icon: '🏷️', value: '' }]
    });
    setNewFieldLabel('');
    setAddingField(false);
  };

  const removeField = (key: string) => {
    store.updateCard(card.id, { customFields: fields.filter(f => f.key !== key) });
  };

  /** 选图后先上传云存储拿 fileID（临时路径重启即失效），失败提示且不写入 */
  const changeAvatar = () => {
    Taro.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async res => {
        const path = res.tempFiles[0]?.tempFilePath;
        if (!path) return;
        try {
          const fileID = await uploadFile(`avatars/${card.id}-${Date.now().toString(36)}.png`, path);
          store.updateCard(card.id, { avatar: fileID });
        } catch (err) {
          console.error('[CardDetail] 头像上传失败:', err);
          toast.error('头像上传失败');
        }
      }
    });
  };

  const addPhotos = () => {
    Taro.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: async res => {
        try {
          const fileIDs = await Promise.all(
            res.tempFiles.map((f, i) =>
              uploadFile(`photos/${card.id}-${Date.now().toString(36)}-${i}.png`, f.tempFilePath)
            )
          );
          if (fileIDs.length) store.updateCard(card.id, { photos: [...card.photos, ...fileIDs] });
        } catch (err) {
          console.error('[CardDetail] 照片上传失败:', err);
          toast.error('照片上传失败');
        }
      }
    });
  };

  const removePhoto = (index: number) => {
    store.updateCard(card.id, { photos: card.photos.filter((_, i) => i !== index) });
  };

  const handleCall = () => {
    const phone = card.phone.replace(/\s/g, '');
    if (!phone) {
      toast.info('未填写电话');
      return;
    }
    Taro.makePhoneCall({ phoneNumber: phone });
  };

  const renderFieldRow = (
    key: string,
    icon: string,
    label: string,
    value: string,
    onChangeText: (v: string) => void,
    options?: { removable?: boolean; action?: React.ReactNode }
  ) => (
    <View className={styles.row} key={key}>
      <Text className={styles.rowIcon}>{icon}</Text>
      <View className={styles.rowBody}>
        <Text className={styles.rowLabel}>{label}</Text>
        {readonly ? (
          <Text className={styles.viewValue}>{value || '未填写'}</Text>
        ) : (
          <Input
            className={styles.input}
            value={value}
            placeholder="未填写"
            placeholderClass={styles.placeholder}
            onInput={e => onChangeText(e.detail.value)}
          />
        )}
      </View>
      {options?.removable && !readonly ? (
        <View className={styles.fieldRemove} onClick={() => removeField(key)}>
          <Text className={styles.fieldRemoveText}>×</Text>
        </View>
      ) : null}
      {options?.action ?? null}
    </View>
  );

  return (
    <View className={styles.container}>
      <View className={styles.mainCard}>
        {/* 右上角风格下拉：切换卡片视觉风格（活名片只读时隐藏） */}
        {!readonly ? (
          <View className={styles.tplDropdown}>
            <View className={styles.tplBtn} style={{ background: tpl.colorBg }} onClick={() => setTplMenuOpen(o => !o)}>
              <Text className={styles.tplBtnText} style={{ color: tpl.color }}>
                {tpl.icon} {tpl.label}
              </Text>
              <Text className={styles.tplBtnArrow} style={{ color: tpl.color }}>▾</Text>
            </View>
            {tplMenuOpen ? (
              <View className={styles.tplMenu}>
                {CARD_TEMPLATES.map(t => (
                  <View
                    key={t.key}
                    className={`${styles.tplMenuItem} ${tpl.key === t.key ? styles.tplMenuItemActive : ''}`}
                    onClick={() => {
                      applyTemplate(t.key);
                      setTplMenuOpen(false);
                    }}
                  >
                    <Text className={styles.tplMenuItemText}>
                      <Text style={{ color: t.color }}>●</Text> {t.label}
                    </Text>
                    {tpl.key === t.key ? <Text className={styles.tplMenuCheck}>✓</Text> : null}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        {/* 头部：头像靠左，信息靠右 */}
        <View className={styles.head}>
          <View className={styles.avatarWrap} onClick={readonly ? undefined : changeAvatar}>
            <Avatar src={card.avatar} name={card.name} size={140} />
            {!readonly ? (
              <View className={styles.avatarEdit}>
                <Text className={styles.avatarEditText}>换头像</Text>
              </View>
            ) : null}
          </View>
          <View className={styles.headInfo}>
            {readonly ? (
              <Text className={styles.nameView}>{card.name || '未填写'}</Text>
            ) : (
              <Input
                className={styles.nameInput}
                value={card.name}
                placeholder="输入姓名"
                placeholderClass={styles.placeholder}
                focus={nameFocused}
                onInput={e => patchText('name', e.detail.value)}
              />
            )}
            {/* 称谓：绑定当前图谱节点的 role（每个图谱各自独立） */}
            <View className={styles.jobRow}>
              <Text className={styles.jobLabel}>称谓</Text>
              {!activeGraph ? (
                <Text className={styles.jobView}>未加入图谱</Text>
              ) : readonly ? (
                <Text className={styles.jobView}>{activeNode?.role || '未填写'}</Text>
              ) : (
                <Input
                  className={styles.jobInput}
                  value={activeNode?.role ?? ''}
                  placeholder="未填写"
                  placeholderClass={styles.placeholder}
                  onInput={e => patchNodeRole(e.detail.value)}
                />
              )}
            </View>
            {/* 所在图谱：下拉选择图谱（称谓随之切换）；无图谱显示一键添加占位（活名片只读时不显示） */}
            {!readonly ? (
              graphs.length ? (
                <View className={styles.graphDropdown}>
                  <View className={styles.graphBtn} onClick={() => setGraphMenuOpen(o => !o)}>
                    <Text className={styles.graphBtnText}>
                      {`${activeGraph?.typeLabel || GRAPH_TYPE_LABELS[activeGraph!.type]}·${activeGraph!.name}`}
                    </Text>
                    <Text className={styles.graphBtnArrow}>▾</Text>
                  </View>
                  {graphMenuOpen ? (
                    <View className={styles.graphMenu}>
                      {graphs.map(g => (
                        <View
                          key={g.id}
                          className={`${styles.graphMenuItem} ${activeGraph?.id === g.id ? styles.graphMenuItemActive : ''}`}
                          onClick={() => {
                            setGraphId(g.id);
                            setGraphMenuOpen(false);
                          }}
                        >
                          <Text className={styles.graphMenuItemText}>{`${g.typeLabel || GRAPH_TYPE_LABELS[g.type]}·${g.name}`}</Text>
                          {activeGraph?.id === g.id ? <Text className={styles.graphMenuCheck}>✓</Text> : null}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : (
                <View className={styles.graphAdd} onClick={() => toast.info('一键添加到图谱即将上线')}>
                  <Text className={styles.graphAddText}>＋ 一键添加到图谱</Text>
                </View>
              )
            ) : null}
          </View>
        </View>
      </View>

      {/* 下拉菜单展开时的透明遮罩：点击空白处收起 */}
      {tplMenuOpen || graphMenuOpen ? (
        <View
          className={styles.tplMask}
          onClick={() => {
            setTplMenuOpen(false);
            setGraphMenuOpen(false);
          }}
        />
      ) : null}

      <View className={styles.section}>
        {renderFieldRow('phone', '📞', '电话', card.phone, v => patchText('phone', v), {
          action: (
            <Text className={styles.rowAction} onClick={handleCall}>
              拨打
            </Text>
          )
        })}
        {/* 公司/职位全风格恒显 */}
        {renderFieldRow('company', '🏢', '公司', card.company, v => patchText('company', v))}
        {renderFieldRow('title', '💼', '职位', card.title, v => patchText('title', v))}
        {/* 全字段展示：预置字段（有值）+ 用户自定义字段 */}
        {visibleFields.map(f =>
          renderFieldRow(f.key, f.icon, f.label, f.value, v => patchFieldValue(f.key, v), {
            removable: !PRESET_FIELD_KEYS.has(f.key)
          })
        )}
        {/* 添加自定义字段（活名片只读时隐藏） */}
        {!readonly ? (
          addingField ? (
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
          )
        ) : null}
      </View>

      <View className={styles.section}>
        <View className={styles.row}>
          <Text className={styles.rowIcon}>🖼️</Text>
          <View className={styles.rowBody}>
            <Text className={styles.rowLabel}>照片（{card.photos.length}）</Text>
          </View>
        </View>
        <View className={styles.photoGrid}>
          {card.photos.map((url, i) => (
            <View key={`${url}-${i}`} className={styles.photoWrap}>
              <Image className={styles.photo} src={url} mode="aspectFill" />
              {!readonly ? (
                <View className={styles.photoRemove} onClick={() => removePhoto(i)}>
                  <Text className={styles.photoRemoveText}>×</Text>
                </View>
              ) : null}
            </View>
          ))}
          {!readonly ? (
            <View className={styles.photoAdd} onClick={addPhotos}>
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
        {readonly ? (
          <Text className={styles.noteView}>{card.note || '未填写'}</Text>
        ) : (
          <Textarea
            className={styles.noteInput}
            value={card.note}
            placeholder="未填写"
            placeholderClass={styles.placeholder}
            maxlength={200}
            autoHeight
            onInput={e => patchText('note', e.detail.value)}
          />
        )}
      </View>

      {/* 浏览态提示条：预览 / 活名片 */}
      {readonly ? (
        <View className={styles.liveBar}>
          <Text className={styles.liveBarText}>
            {canEdit
              ? '👁️ 预览中 · 这是别人看到的样子'
              : `🔄 活名片 · 内容由 ${card.name || '对方'} 维护，打开即显示最新`}
          </Text>
        </View>
      ) : null}

      <View className={styles.actionBar}>
        {canEdit && !preview ? (
          <View
            className={`${styles.actionBtn} ${styles.previewBtn}`}
            onClick={() => {
              Taro.hideKeyboard();
              setPreview(true);
            }}
          >
            <Text>预览</Text>
          </View>
        ) : null}
        {canEdit && preview ? (
          <View className={`${styles.actionBtn} ${styles.previewBtn}`} onClick={() => setPreview(false)}>
            <Text>退出预览</Text>
          </View>
        ) : null}
        <Button className={`${styles.actionBtn} ${styles.shareBtn}`} openType="share">
          <Text>分享名片</Text>
        </Button>
      </View>
    </View>
  );
};

export default CardDetailPage;
