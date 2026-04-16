/**
 * Known error codes used across the CLI.
 * This union provides intellisense suggestions while still accepting any string,
 * allowing dynamic codes and future additions.
 */
export type ErrorCode =
    // Auth & permissions
    | 'AUTH_FAILED'
    | 'INSUFFICIENT_SCOPE'
    | 'INVALID_TOKEN'
    | 'NO_TOKEN'
    | 'READ_ONLY'
    // Validation
    | 'CONFLICTING_OPTIONS'
    | 'INVALID_ID'
    | 'INVALID_MINUTES'
    | 'INVALID_REF'
    | 'INVALID_SCOPE'
    | 'INVALID_STATE'
    | 'INVALID_TYPE'
    | 'INVALID_URL'
    | 'MISSING_CONTENT'
    | 'MISSING_YES_FLAG'
    // Not found
    | 'NOT_FOUND'
    | 'USER_NOT_FOUND'
    | 'WORKSPACE_NOT_FOUND'
    // Ambiguous matches
    | 'AMBIGUOUS_USER'
    | 'AMBIGUOUS_WORKSPACE'
    // State errors
    | 'ALREADY_INSTALLED'
    | 'BATCH_FAILED'
    | 'FILE_READ_ERROR'
    | 'NOT_CREATOR'
    | 'NOT_INSTALLED'
    | 'UNKNOWN_AGENT'
    // API & internal
    | 'API_ERROR'
    | 'INTERNAL_ERROR'
    // Escape hatch for dynamic codes
    | (string & {})

export type ErrorType = 'error' | 'info'

/**
 * Check whether an error is a Twist API 403 "Insufficient scope" response.
 * Works with any error shaped like TwistRequestError (httpStatusCode + responseData).
 */
export function isInsufficientScope(error: unknown): boolean {
    if (
        typeof error !== 'object' ||
        error === null ||
        !('httpStatusCode' in error) ||
        !('responseData' in error)
    ) {
        return false
    }
    const { httpStatusCode, responseData } = error as {
        httpStatusCode: number
        responseData: { error_string?: string } | undefined
    }
    return (
        httpStatusCode === 403 &&
        responseData?.error_string?.includes('Insufficient scope') === true
    )
}

export class CliError extends Error {
    constructor(
        public readonly code: ErrorCode,
        message: string,
        public readonly hints?: string[],
        public readonly type: ErrorType = 'error',
    ) {
        super(message)
        this.name = 'CliError'
    }
}
