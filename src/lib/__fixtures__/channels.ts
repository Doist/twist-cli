// A fully-populated channel object as returned by the API, for tests that
// resolve/fetch a single channel. Pass overrides to vary individual fields.
export function createChannelFixture(overrides: Record<string, unknown> = {}) {
    return {
        id: 500,
        name: 'general',
        workspaceId: 1,
        userIds: [1, 2, 3],
        creator: 1,
        public: true,
        archived: false,
        created: new Date(),
        version: 1,
        url: 'https://twist.com/a/1/ch/500',
        ...overrides,
    }
}
