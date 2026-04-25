/**
 * 描述后端返回或前端生成的统一应用错误。
 */
export interface ApplicationError {
  code: string;
  message: string;
}

/**
 * 创建前端本地业务错误。
 */
export function createApplicationError(
  code: string,
  message: string,
): ApplicationError {
  return {
    code,
    message,
  };
}

/**
 * 将未知异常规范化为稳定的应用错误结构。
 */
export function normalizeApplicationError(
  error: unknown,
  fallbackMessage = "Unexpected application error.",
): ApplicationError {
  if (isApplicationError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return {
      code: "CLIENT_ERROR",
      message: error.message,
    };
  }

  if (typeof error === "string" && error.trim()) {
    return {
      code: "UNKNOWN_ERROR",
      message: error,
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: fallbackMessage,
  };
}

/**
 * 判断未知值是否符合应用错误结构。
 */
function isApplicationError(error: unknown): error is ApplicationError {
  return Boolean(
    error &&
      typeof error === "object" &&
      typeof (error as ApplicationError).code === "string" &&
      typeof (error as ApplicationError).message === "string",
  );
}
