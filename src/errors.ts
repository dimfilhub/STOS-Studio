/**
 * An error the user can fix (missing file, bad setting, ...). Its message is shown as it is,
 * without a stack trace; any other error is reported as "Unexpected error".
 */
export class StosError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StosError';
    }
}

/** Where progress messages go (the task terminal, or nowhere in tests). */
export type Log = (message: string) => void;
export const noLog: Log = () => { };
