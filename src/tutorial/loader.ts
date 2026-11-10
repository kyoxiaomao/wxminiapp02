import { familyCards, familyEdges, familyGraph, familyNodes } from '@/mock/family';
import type { Card, Edge, Graph, GraphNode } from '@/types';

/** 示例实体 id 统一前缀（批次内唯一，绝不与云端数据冲突） */
export const TUTORIAL_PREFIX = 'tut-';

export interface TutorialDataset {
  batchId: string;
  graph: Graph;
  cards: Card[];
  nodes: GraphNode[];
  edges: Edge[];
  /** 成员代号 → 实体 id（guide 步骤 JSON 只写代号） */
  codeToNodeId: Map<string, string>;
  codeToCardId: Map<string, string>;
}

/**
 * 家族示例数据 → 教程沙箱数据
 * 只取 family.ts 的家族图谱（公司图谱不进教程），
 * 深拷贝后给所有 id 加 tut-<batch>- 前缀，避免与真实数据/云端唯一索引冲突。
 */
export function buildTutorialDataset(batchId?: string): TutorialDataset {
  const batch = batchId || `b${Date.now().toString(36)}`;
  const prefix = `${TUTORIAL_PREFIX}${batch}-`;
  const nodeIdOf = (code: string) => `${prefix}node-${code}`;
  const cardIdOf = (code: string) => `${prefix}card-${code}`;
  const codeOfNode = (id: string) => id.replace(/^node-/, '');
  const codeOfCard = (id: string) => id.replace(/^card-/, '');

  const graph: Graph = {
    ...familyGraph,
    id: `${prefix}graph-family`,
    name: '陈氏家族图谱（示例）'
  };

  const codeToNodeId = new Map<string, string>();
  const codeToCardId = new Map<string, string>();

  const cards: Card[] = familyCards.map(c => {
    const code = codeOfCard(c.id);
    const id = cardIdOf(code);
    codeToCardId.set(code, id);
    return {
      ...c,
      id,
      // 示例卡不占用「我的名片」：真实用户的 isMe 卡片始终以真实数据为准
      isMe: false,
      photos: [...(c.photos || [])],
      customFields: (c.customFields || []).map(f => ({ ...f }))
    };
  });

  const nodes: GraphNode[] = familyNodes.map(n => {
    const code = codeOfNode(n.id);
    const id = nodeIdOf(code);
    codeToNodeId.set(code, id);
    return {
      ...n,
      id,
      graphId: graph.id,
      cardId: n.cardId ? cardIdOf(codeOfCard(n.cardId)) : null
    };
  });

  const edges: Edge[] = familyEdges.map((e, i) => ({
    ...e,
    id: `${prefix}edge-${i + 1}`,
    graphId: graph.id,
    source: nodeIdOf(codeOfNode(e.source)),
    target: nodeIdOf(codeOfNode(e.target))
  }));

  return { batchId: batch, graph, cards, nodes, edges, codeToNodeId, codeToCardId };
}
