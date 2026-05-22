import { type ChannelMutationOptions, mutateChannelMembership } from './membership-helpers.js'

export async function addChannelMembers(
    channelRef: string,
    refs: string[],
    options: ChannelMutationOptions,
): Promise<void> {
    return mutateChannelMembership(channelRef, refs, 'add', options)
}
