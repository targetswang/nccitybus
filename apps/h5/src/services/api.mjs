export class ApiError extends Error {
    constructor(code, message, status) {
        super(message);
        this.code = code;
        this.status = status;
    }
}
export async function request(path, { method = 'GET', data, signal, token } = {}) {
    let response;
    try {
        response = await fetch('/api/v1' + path, {
            method,
            headers: {
                ...(data ? {
                    'Content-Type': 'application/json'
                } : {}),
                ...(token ? {
                    Authorization: `Bearer ${token}`
                } : {})
            },
            body: data ? JSON.stringify(data) : undefined,
            signal: signal ? AbortSignal.any([
                signal,
                AbortSignal.timeout(10000)
            ]) : AbortSignal.timeout(10000)
        });
    }
    catch (e) {
        if (e.name === 'AbortError')
            throw e;
        throw new ApiError('NETWORK_ERROR', '网络连接失败，请重试', 0);
    }
    let result;
    try {
        result = await response.json();
    }
    catch {
        throw new ApiError('INVALID_RESPONSE', '服务返回格式错误', response.status);
    }
    if (!response.ok)
        throw new ApiError(result.error?.code || 'SERVER_ERROR', result.error?.message || '服务暂不可用', response.status);
    return result;
}

