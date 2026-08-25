import type { Timestamp } from "firebase/firestore";

export interface UserProfile { uid: string; displayName: string; email: string | null; photoURL?: string | null; photoStoragePath?: string | null; createdAt: Timestamp; updatedAt: Timestamp }
export interface Friend { id: string; name: string; isMe: boolean; archived: boolean; photoURL?: string | null; photoStoragePath?: string | null; createdAt: Timestamp; updatedAt: Timestamp }
export interface FriendGroup { id: string; name: string; friendIds: string[]; createdAt: Timestamp; updatedAt: Timestamp }
export interface Folder { id: string; name: string; icon?: string; defaultFriendGroupId?: string | null; createdAt: Timestamp; updatedAt: Timestamp }
export interface Contribution { id: string; title: string; date: Timestamp; payerFriendId: string; participantIds: string[]; createdAt: Timestamp; updatedAt: Timestamp }
export interface Expense { id: string; title: string; amount: number; payerFriendId?: string; participantIds: string[]; createdAt: Timestamp; updatedAt: Timestamp }
export interface ContributionWithExpenses extends Contribution { expenses: Expense[] }
export interface ExpenseDraft { id: string; title: string; amount: string; payerFriendId: string; participantIds: string[] }
export interface ContributionInput { title: string; date: Date; payerFriendId: string; participantIds: string[]; expenses: Array<{ title: string; amount: number; payerFriendId: string; participantIds: string[] }> }
export interface SettlementDirection { fromFriendId: string; toFriendId: string; amount: number }
export interface FolderFinancials { folder: Folder; contributions: ContributionWithExpenses[] }
export interface Settlement { id: string; folderId: string; fromFriendId: string; toFriendId: string; amount: number; date: Timestamp; note?: string; createdAt: Timestamp; updatedAt: Timestamp }
export type CreateFriendInput = Pick<Friend, "name">;
export type FriendGroupInput = Pick<FriendGroup, "name" | "friendIds">;
export type FolderInput = Pick<Folder, "name" | "icon" | "defaultFriendGroupId">;
