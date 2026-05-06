// Re-export from the new motion types for backwards compat
export type { WalrusUploadResponse } from './motion';
export type { Submission, SubmissionStatus, FormConfig, SessionField, SessionFieldType } from './motion';

// Legacy types kept for any old code that hasn't been removed yet
export interface WalrusResponse { blobId: string; objectId: string; endEpoch?: number; }
