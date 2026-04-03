import { getCurrentWorkspaceId, getSessionUser, getTwistClient } from '../../lib/api.js'
import { resolveUserRefs, resolveWorkspaceRef } from '../../lib/refs.js'
import {
    type ConversationWithOptions,
    findDirectConversation,
    getAllConversations,
    listConversationsWithUser,
} from './helpers.js'

export async function findConversationWithUser(
    userRef: string,
    workspaceRef: string | undefined,
    options: ConversationWithOptions,
): Promise<void> {
    try {
        if (workspaceRef && options.workspace) {
            throw new Error('Cannot specify workspace both as argument and --workspace flag')
        }

        let workspaceId: number
        const ref = workspaceRef || options.workspace

        if (ref) {
            const workspace = await resolveWorkspaceRef(ref)
            workspaceId = workspace.id
        } else {
            workspaceId = await getCurrentWorkspaceId()
        }

        const userIds = await resolveUserRefs(userRef, workspaceId)
        if (userIds.length !== 1) {
            throw new Error('Expected a single user reference')
        }

        const targetUserId = userIds[0]
        const client = await getTwistClient()
        const [sessionUser, targetUser] = await Promise.all([
            getSessionUser(),
            client.workspaceUsers.getUserById({ workspaceId, userId: targetUserId }),
        ])

        if (options.includeGroups) {
            const conversations = await getAllConversations(workspaceId)
            const matchingConversations = conversations.filter((conversation) =>
                conversation.userIds.includes(targetUser.id),
            )

            await listConversationsWithUser(matchingConversations, workspaceId, options)
            return
        }

        const { directConversation, groupConversationCount } = await findDirectConversation(
            workspaceId,
            sessionUser.id,
            targetUser.id,
        )

        if (!directConversation) {
            const suggestion =
                groupConversationCount > 0
                    ? ` Found ${groupConversationCount} group conversation${groupConversationCount === 1 ? '' : 's'} with ${targetUser.name}. Use --include-groups to list them.`
                    : ''

            console.log(`No 1:1 conversation found with ${targetUser.name}.${suggestion}`)
            return
        }

        await listConversationsWithUser([directConversation], workspaceId, options)
    } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
    }
}
