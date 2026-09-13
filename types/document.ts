/**
 * 文档领域类型（客户端与服务端共用的契约）。
 *
 * 与 types/issue.ts 保持一致的两条约定：
 * 1. 日期用 ISO 字符串而不是 Date——服务端组件把数据传给客户端组件时只保证可序列化，
 *    显式转成字符串可以避免两端对时区/格式的隐式假设。
 * 2. 中文标签在此集中定义，是本项目的唯一真源；组件不得各自硬编码文案。
 */

export const DOCUMENT_STATUSES = ["DRAFT", "ARCHIVED"] as const;
export type DocumentStatusValue = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_FORMATS = ["MARKDOWN", "RICH_TEXT"] as const;
export type DocumentFormatValue = (typeof DOCUMENT_FORMATS)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatusValue, string> = {
  DRAFT: "草稿",
  ARCHIVED: "已归档",
};

export const DOCUMENT_FORMAT_LABELS: Record<DocumentFormatValue, string> = {
  MARKDOWN: "Markdown",
  RICH_TEXT: "富文本",
};

/**
 * 文档列表项：**不含正文**。
 * 正文单条上限 200k 字符，列表页若连同正文一起取出，会同时放大数据库读、服务端内存与 RSC 负载。
 */
export type DocumentSummaryItem = {
  id: string;
  title: string;
  summary: string | null;
  status: DocumentStatusValue;
  format: DocumentFormatValue;
  contentVersion: number;
  createdAt: string;
  updatedAt: string;
};

/** 文档详情：编辑器需要正文，只有详情通道才携带。 */
export type DocumentItem = DocumentSummaryItem & {
  content: string;
};

export type DocumentVersionItem = {
  id: string;
  version: number;
  title: string;
  createdById: string;
  createdAt: string;
};

export function isDocumentStatus(value: unknown): value is DocumentStatusValue {
  return typeof value === "string" && (DOCUMENT_STATUSES as readonly string[]).includes(value);
}

export function isDocumentFormat(value: unknown): value is DocumentFormatValue {
  return typeof value === "string" && (DOCUMENT_FORMATS as readonly string[]).includes(value);
}
