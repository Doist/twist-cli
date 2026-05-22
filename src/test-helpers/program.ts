import { Command } from 'commander'

// Build a Commander program with exitOverride() (so parse errors throw instead
// of calling process.exit) and the given command(s) registered onto it.
export function createTestProgram(register: (program: Command) => void): Command {
    const program = new Command()
    program.exitOverride()
    register(program)
    return program
}
