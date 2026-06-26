export interface RemoteFile {
    path: string;
    hash: string;
    size: number;
    mtime: number;
}

export interface VersionEntry {
    id: string;
    size: number;
    mtime: number;
}

/** Origem de um dos lados do merge. */
export type MergeSourceType = "vault" | "version";

export interface MergeSide {
    type: MergeSourceType;
    vaultId: string;
    /** usado quando type === "version" */
    versionId: string;
}
