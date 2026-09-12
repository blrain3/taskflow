/**
 * 字段级错误提示。无内容时不渲染，避免布局跳动。
 * id 供输入框的 aria-describedby 引用——错误必须与输入框程序化关联，
 * 屏幕阅读器用户聚焦出错的输入框时才能听到具体错因（WCAG 3.3.1）。
 */
export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;

  return (
    <p id={id} className="mt-1 text-sm text-danger" role="alert">
      {message}
    </p>
  );
}

/** 表单级错误提示 */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p className="rounded-lg bg-danger-subtle px-3 py-2 text-sm text-danger" role="alert">
      {message}
    </p>
  );
}
