import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 统一的服务端日期格式化（zh-CN，到分钟）。
 *
 * 必须**显式指定 timeZone**：`toLocaleString` 默认取服务器时区，本地开发（UTC+8）与
 * 容器（通常 UTC）会渲染出相差 8 小时的时间，同一份数据在两处显示不一致。
 * 当前产品面向国内用户与国内部署，先固定为 Asia/Shanghai；将来要多时区支持时，
 * 应改为按用户偏好传入 timeZone，而不是去掉这个参数。
 */
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

export function formatDateTime(isoString: string): string {
  return DATE_TIME_FORMATTER.format(new Date(isoString));
}
