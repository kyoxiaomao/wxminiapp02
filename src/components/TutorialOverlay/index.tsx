import React from 'react';
import { View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { TutorialStep } from '@/tutorial/types';
import styles from './index.module.scss';

export interface TutorialHole {
  /** 视口坐标（px） */
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  step: TutorialStep;
  index: number;
  total: number;
  /** 挖孔区域；为空表示全屏遮罩（欢迎 / 完成） */
  hole: TutorialHole | null;
  /** 该步骤等待用户真实操作：只显示「跳过 / 退出」，不显示下一步 */
  waiting: boolean;
  onNext: () => void;
  onSkip: () => void;
  onExit: () => void;
}

/**
 * 新人指引遮罩：四块独立面板围出挖孔，孔内放行真实操作。
 *
 * 全部用普通 View：画布是 Canvas 2D，已开启同层渲染，View 可以直接浮在画布之上；
 * 不再用 CoverView —— 它默认 white-space:nowrap、文本排版会裁字，且面板半透明叠加会出黑线。
 * 四块面板必须各自独立定位，不能用全屏父容器——父容器会拦截挖孔内的触摸。
 */
const TutorialOverlay: React.FC<Props> = ({ step, index, total, hole, waiting, onNext, onSkip, onExit }) => {
  const { windowWidth: W, windowHeight: H } = Taro.getSystemInfoSync();
  const mask = 'rgba(24, 16, 32, 0.55)';
  // 面板边界取整：四块严格共用同一条边，避免亚像素在挖孔上下沿留下亮线；
  // 也不能互相重叠，两层半透明叠加会变成深色「黑线」
  const panels = (() => {
    if (!hole) return [{ left: 0, top: 0, width: W, height: H }];
    const x0 = Math.round(hole.x);
    const y0 = Math.round(hole.y);
    const x1 = Math.round(hole.x + hole.w);
    const y1 = Math.round(hole.y + hole.h);
    return [
      { left: 0, top: 0, width: W, height: y0 },
      { left: 0, top: y1, width: W, height: Math.max(0, H - y1) },
      { left: 0, top: y0, width: x0, height: y1 - y0 },
      { left: x1, top: y0, width: Math.max(0, W - x1), height: y1 - y0 }
    ];
  })();

  // 气泡宽 472rpx（=236px@375），居中；宽度写在样式表里，和 rpx 字号同一套缩放
  const bubbleWidthPx = (472 * W) / 750;
  // 目标在下半屏 → 气泡放上方（用 bottom 定位，向上生长，不会压住挖孔）
  const above = !!hole && hole.y + hole.h / 2 > H / 2;
  const bubbleStyle: Record<string, string> = {
    left: `${Math.max(16, (W - bubbleWidthPx) / 2)}px`
  };
  if (hole) {
    if (above) bubbleStyle.bottom = `${Math.max(10, H - hole.y + 10)}px`;
    else bubbleStyle.top = `${hole.y + hole.h + 10}px`;
  } else {
    bubbleStyle.top = '50%';
    bubbleStyle.transform = 'translateY(-50%)';
  }

  return (
    <>
      {panels.map((p, i) => (
        <View
          key={`m${i}`}
          className={styles.mask}
          style={{
            left: `${p.left}px`,
            top: `${p.top}px`,
            width: `${p.width}px`,
            height: `${p.height}px`,
            background: mask
          }}
        />
      ))}

      <View className={styles.bubble} style={bubbleStyle}>
        <View className={styles.counter}>{`${index + 1}/${total}`}</View>
        <View className={styles.title}>{step.title}</View>
        <View className={styles.desc}>{step.desc}</View>
        <View className={styles.actions}>
          <View className={styles.linkText} onClick={onSkip}>
            跳过
          </View>
          <View className={styles.linkText} onClick={onExit}>
            退出
          </View>
          {waiting ? (
            <View className={styles.wait}>按提示操作</View>
          ) : (
            <View className={styles.btnPrimary} onClick={onNext}>
              {index >= total - 1 ? '完成' : '开始'}
            </View>
          )}
        </View>
      </View>
    </>
  );
};

export default TutorialOverlay;
