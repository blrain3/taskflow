/** 字段级错误提示。无内容时不渲染，避免布局跳动。 */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p className="mt-1 text-sm text-red-600" role="alert">
      {message}
    </p>
  );
}

/** 表单级错误提示 */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      {message}
    </p>
  );
}
