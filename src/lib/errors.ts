import { CliError as BaseCliError, type CliErrorCode, type ErrorType } from '@doist/cli-core'

export { BaseCliError }
export type { ErrorType } from '@doist/cli-core'

/**
 * Known error codes used across the CLI.
 * This union provides intellisense suggestions while still accepting any string,
 * allowing dynamic codes and future additions.
 */
export type ErrorCode =
    // Auth & permissions
    | 'AUTH_FAILED'
    | 'AUTH_MIGRATION_PENDING'
    | 'FORBIDDEN'
    | 'INSUFFICIENT_SCOPE'
    | 'INVALID_TOKEN'
    | 'NO_TOKEN'
    | 'READ_ONLY'
    // Validation
    | 'CONFLICTING_OPTIONS'
    | 'INVALID_CURSOR'
    | 'INVALID_DATE'
    | 'INVALID_ID'
    | 'INVALID_MINUTES'
    | 'INVALID_REF'
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
    | 'ACCOUNT_NOT_FOUND'
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

function hasTwistStatusCode(error: unknown, status: number): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'httpStatusCode' in error &&
        (error as { httpStatusCode: number }).httpStatusCode === status
    )
}

/**
 * Check whether an error is a Twist API 403 "Insufficient scope" response.
 * Works with any error shaped like TwistRequestError (httpStatusCode + responseData).
 */
export function isInsufficientScope(error: unknown): boolean {
    if (!hasTwistStatusCode(error, 403) || !('responseData' in (error as object))) {
        return false
    }
    const { responseData } = error as {
        responseData: { error_string?: string } | undefined
    }
    return (
        typeof responseData?.error_string === 'string' &&
        responseData.error_string.includes('Insufficient scope')
    )
}

/**
 * Check whether an error is any Twist API 403 response.
 *
 * Precedence: callers must test `isInsufficientScope` first so OAuth-scope
 * 403s keep their dedicated `INSUFFICIENT_SCOPE` code and hints; `isForbidden`
 * is the catch-all fallback for plain workspace-permission 403s.
 */
export function isForbidden(error: unknown): boolean {
    return hasTwistStatusCode(error, 403)
}

/**
 * Twist-flavoured CliError that preserves the historical positional
 * `(code, message, hints?, type?)` signature used across hundreds of call
 * sites. Internally it forwards to the cli-core options-object form.
 *
 * `code` accepts the local twist `ErrorCode` union plus any cli-core
 * canonical code (`CliErrorCode`), so call sites like
 * `new CliError('CONFIG_READ_FAILED', …)` still type-check without
 * `CONFIG_*` having to live in the local union.
 */
export class CliError extends BaseCliError<ErrorCode> {
    constructor(
        code: ErrorCode | CliErrorCode,
        message: string,
        hints?: string[],
        type: ErrorType = 'error',
    ) {
        super(code, message, { hints, type })
    }
}
