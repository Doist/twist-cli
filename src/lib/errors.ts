/**
 * Known error codes used across the CLI.
 * This union provides intellisense suggestions while still accepting any string,
 * allowing dynamic codes and future additions.
 */
export type ErrorCode =
    // Auth & permissions
    | 'ACCOUNT_NOT_FOUND'
    | 'AUTH_FAILED'
    | 'CONFIG_WRITE_FAILED'
    | 'INSUFFICIENT_SCOPE'
    | 'INVALID_ACCOUNT'
    | 'INVALID_TOKEN'
    | 'NO_ACCOUNT_SELECTED'
    | 'NO_TOKEN'
    | 'READ_ONLY'
    | 'USER_FLAG_INVALID'
    // Validation
    | 'CONFLICTING_OPTIONS'
    | 'INVALID_CURSOR'
    | 'INVALID_DATE'
    | 'INVALID_ID'
    | 'INVALID_MINUTES'
    | 'INVALID_REF'
    | 'MISSING_REF'
    | 'INVALID_SCOPE'
    | 'INVALID_STATE'
    | 'INVALID_TYPE'
    | 'INVALID_URL'
    | 'INVALID_VALUE'
    | 'MISSING_CONTENT'
    | 'MISSING_YES_FLAG'
    | 'UNKNOWN_KEY'
    | 'INVALID_NAME'
    | 'MISSING_USERS'
    // Not found
    | 'CHANNEL_NOT_FOUND'
    | 'GROUP_NOT_FOUND'
    | 'NOT_FOUND'
    | 'USER_NOT_FOUND'
    | 'WORKSPACE_NOT_FOUND'
    // Ambiguous matches
    | 'AMBIGUOUS_CHANNEL'
    | 'AMBIGUOUS_GROUP'
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
    // Config file inspection
    | 'CONFIG_READ_FAILED'
    | 'CONFIG_INVALID_JSON'
    | 'CONFIG_INVALID_SHAPE'
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
        typeof responseData?.error_string === 'string' &&
        responseData.error_string.includes('Insufficient scope')
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
