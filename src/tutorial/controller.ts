import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import { store } from '@/store';
import guideJson from './family-guide.json';
import type {
  TutorialAdvance,
  TutorialAdvancePayload,
  TutorialSnapshot,
  TutorialState,
  TutorialStep
} from './types';

/** 步骤与文案唯一来源 */
export const TUTORIAL_STEPS = guideJson as TutorialStep[];

const SNAPSHOT_KEY = 'tutorial_snapshot_v1';
const PROMPT_SEEN_KEY = 'tutorial_prompt_seen_v1';

const INITIAL: TutorialState = {
  active: false,
  batchId: '',
  stepIndex: 0,
  practiceNodeId: '',
  practiceEdgeId: '',
  cardRef: '',
  prevGraphId: ''
};

/**
 * 新人指引状态机
 * - 只在 start/resume 时把示例数据载入 store 沙箱；退出/完成/中断统一走 clearTutorialData
 * - 只持久化步骤快照（stepIndex + 练习实体 id + 已绑名片 + 原图谱），不持久化任何 mock 数据
 */
class TutorialController {
  private state: TutorialState = { ...INITIAL };
  private listeners = new Set<() => void>();

  getState(): TutorialState {
    return this.state;
  }

  getStep(): TutorialStep | undefined {
    return TUTORIAL_STEPS[this.state.stepIndex];
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** 首次进入提示是否已看过（取消也算看过） */
  promptSeen(): boolean {
    return !!Taro.getStorageSync(PROMPT_SEEN_KEY);
  }

  markPromptSeen(): void {
    Taro.setStorageSync(PROMPT_SEEN_KEY, 1);
  }

  /** 是否存在可续播的步骤快照 */
  hasSnapshot(): boolean {
    return !!this.readSnapshot();
  }

  /** 从头开始：载入新的示例批次 */
  start(prevGraphId: string): void {
    this.discardSnapshot();
    store.loadTutorialFamily();
    this.state = {
      ...INITIAL,
      active: true,
      batchId: store.tutorialBatchId,
      stepIndex: 0,
      prevGraphId
    };
    this.commit();
  }

  /**
   * 续播：用快照里的批次 id 重建示例数据与练习节点
   * 名片页中断的步骤降级回「关联名片」，避免恢复后自动停在只能跨页的步骤
   */
  resume(): boolean {
    const snap = this.readSnapshot();
    if (!snap) return false;
    store.loadTutorialFamily(snap.batchId);
    if (snap.practiceNodeId) {
      store.restoreTutorialPractice(
        snap.practiceNodeId,
        snap.practiceEdgeId,
        store.tutorialEgoNodeId,
        snap.cardRef || null
      );
    }
    // 续播降级：详情卡/名片页依赖的跨页或浮层状态在切走后已不存在，
    // 回到「打开详情」让用户重新点开，避免恢复后停在无孔可挖的空步骤
    const degrade: Record<number, number> = { 2: 1, 4: 3, 5: 3 };
    const stepIndex = degrade[snap.stepIndex] ?? snap.stepIndex;
    this.state = {
      active: true,
      batchId: snap.batchId,
      stepIndex,
      practiceNodeId: snap.practiceNodeId,
      practiceEdgeId: snap.practiceEdgeId,
      cardRef: snap.cardRef,
      prevGraphId: snap.prevGraphId
    };
    this.commit();
    console.info('[Tutorial] 续播：从第 %d 步继续', this.state.stepIndex + 1);
    return true;
  }

  /** 气泡主按钮：下一步；（末步由调用方走 complete） */
  next(): void {
    if (!this.state.active) return;
    if (this.state.stepIndex >= TUTORIAL_STEPS.length - 1) {
      this.complete();
      return;
    }
    this.state = { ...this.state, stepIndex: this.state.stepIndex + 1 };
    this.commit();
  }

  /**
   * 页面真实操作上报：只有命中当前步骤的 advance 才推进
   * 顺带记录练习节点 / 关系 / 已绑名片，供中断续播重建
   */
  notify(advance: TutorialAdvance, payload?: TutorialAdvancePayload): void {
    if (!this.state.active) return;
    const step = this.getStep();
    if (!step || step.advance !== advance) return;
    const next: TutorialState = { ...this.state, stepIndex: this.state.stepIndex + 1 };
    if (advance === 'nodeAdded') {
      next.practiceNodeId = payload?.nodeId || '';
      next.practiceEdgeId = payload?.edgeId || '';
    }
    if (advance === 'cardBound') {
      next.cardRef = payload?.cardId || '';
    }
    this.state = next;
    this.commit();
    console.info('[Tutorial] 步骤推进 → %d（%s）', this.state.stepIndex + 1, advance);
  }

  /** 跳过：保留快照，清空示例数据 */
  skip(): void {
    this.stop(true);
  }

  /** 退出：保留快照，清空示例数据 */
  exit(): void {
    this.stop(true);
  }

  /** 完成：清空快照与示例数据 */
  complete(): void {
    this.stop(false);
  }

  /** 中断（切 tab / 退出页面 / 名片页未绑定就离开）：保留快照，清空示例数据 */
  interrupt(): void {
    if (!this.state.active) return;
    this.stop(true);
  }

  private stop(keepSnapshot: boolean): void {
    if (!this.state.active) return;
    if (keepSnapshot) this.writeSnapshot();
    else this.discardSnapshot();
    store.clearTutorialData();
    this.state = { ...this.state, active: false, practiceNodeId: '', practiceEdgeId: '' };
    this.emit();
  }

  private commit(): void {
    this.writeSnapshot();
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach(fn => fn());
  }

  private writeSnapshot(): void {
    const snap: TutorialSnapshot = {
      batchId: this.state.batchId,
      stepIndex: this.state.stepIndex,
      practiceNodeId: this.state.practiceNodeId,
      practiceEdgeId: this.state.practiceEdgeId,
      cardRef: this.state.cardRef,
      prevGraphId: this.state.prevGraphId
    };
    Taro.setStorageSync(SNAPSHOT_KEY, snap);
  }

  private readSnapshot(): TutorialSnapshot | null {
    const raw = Taro.getStorageSync(SNAPSHOT_KEY) as TutorialSnapshot | '' | undefined;
    if (!raw || !raw.batchId) return null;
    return raw;
  }

  private discardSnapshot(): void {
    Taro.removeStorageSync(SNAPSHOT_KEY);
  }
}

export const tutorialController = new TutorialController();

/** 页面订阅指引状态（controller 非响应式，靠订阅驱动重渲染） */
export function useTutorial(): TutorialState {
  const [state, setState] = useState<TutorialState>(tutorialController.getState());
  useEffect(() => {
    setState(tutorialController.getState());
    return tutorialController.subscribe(() => setState(tutorialController.getState()));
  }, []);
  return state;
}
