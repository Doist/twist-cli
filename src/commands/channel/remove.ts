import { type ChannelMutationOptions, mutateChannelMembership } from './membership-helpers.js'

export async function removeChannelMembers(
    channelRef: string,
    refs: string[],
    options: ChannelMutationOptions,
): Promise<void> {
    return mutateChannelMembership(channelRef, refs, 'remove', options)
}
