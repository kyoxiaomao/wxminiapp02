/** 新人指引：步骤 / 快照类型（唯一文案与流程来源是 family-guide.json） */

/** 步骤推进条件：manual = 点气泡主按钮；其余等待真实操作 */
export type TutorialAdvance =
  | 'manual'
  | 'longPress'
  | 'nodeAdded'
  | 'detailOpened'
  | 'linkPending'
  | 'cardBound'
  | 'edgeChanged'
  | 'nodeDeleted';

/** 遮罩挖孔目标：code 支持家族成员代号，`@practice` 指本次练习新增的节点 */
export type TutorialTargetKind =
  | 'none'
  | 'node'
  | 'addBtn'
  | 'delBtn'
  | 'edge'
  | 'detailLinkBtn';

export interface TutorialTarget {
  kind: TutorialTargetKind;
  /** g1 / p1 … 或 @practice */
  code?: string;
  /** 挖孔外扩像素 */
  padding?: number;
}

export interface TutorialStep {
  id: string;
  title: string;
  desc: string;
  hint?: string;
  target: TutorialTarget;
  /** 进入该步骤时的取景目标（code 同上） */
  camera?: { code: string; zoom?: number };
  advance: TutorialAdvance;
  allowPrev?: boolean;
}

/** 中断快照：只存步骤与练习实体，不存任何 mock 数据 */
export interface TutorialSnapshot {
  batchId: string;
  stepIndex: number;
  practiceNodeId: string;
  practiceEdgeId: string;
  /** 已绑定名片 id（示例卡或真实卡） */
  cardRef: string;
  prevGraphId: string;
}

export interface TutorialState extends TutorialSnapshot {
  active: boolean;
}

export type TutorialAdvancePayload = {
  nodeId?: string;
  edgeId?: string;
  cardId?: string;
};
