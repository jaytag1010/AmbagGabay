import type { Timestamp } from "firebase/firestore";

export interface UserProfile { uid: string; displayName: string; email: string | null; photoURL?: string | null; createdAt: Timestamp; updatedAt: Timestamp }
export interface Friend { id: string; name: string; isMe: boolean; archived: boolean; createdAt: Timestamp; updatedAt: Timestamp }
export interface FriendGroup { id: string; name: string; friendIds: string[]; createdAt: Timestamp; updatedAt: Timestamp }
export interface Folder { id: string; name: string; icon?: string; defaultFriendGroupId?: string | null; createdAt: Timestamp; updatedAt: Timestamp }
export interface Contribution { id: string; title: string; date: Timestamp; payerFriendId: string; participantIds: string[]; createdAt: Timestamp; updatedAt: Timestamp }
export interface Expense { id: string; title: string; amount: number; participantIds: string[]; createdAt: Timestamp; updatedAt: Timestamp }
export interface Settlement { id: string; folderId: string; fromFriendId: string; toFriendId: string; amount: number; date: Timestamp; note?: string; createdAt: Timestamp; updatedAt: Timestamp }
export type CreateFriendInput = Pick<Friend, "name">;
export type FriendGroupInput = Pick<FriendGroup, "name" | "friendIds">;
export type FolderInput = Pick<Folder, "name" | "icon" | "defaultFriendGroupId">;
