import type { Timestamp } from "firebase/firestore";

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string | null;
  photoURL?: string | null;
  photoStoragePath?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  appearance?: { mode?: AppearanceMode; theme?: AccentTheme };
}
export type AppearanceMode = "system" | "light" | "dark";
export type AccentTheme =
  | "ambag-green"
  | "ocean-blue"
  | "teal"
  | "violet"
  | "rose"
  | "amber"
  | "slate";
export interface Friend {
  id: string;
  name: string;
  isMe: boolean;
  archived: boolean;
  archivedAt?: Timestamp | null;
  photoURL?: string | null;
  photoStoragePath?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  linkedUserId?: string | null;
  linkedEmail?: string | null;
}
export interface FriendGroup {
  id: string;
  name: string;
  friendIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export interface Folder {
  id: string;
  name: string;
  icon?: string;
  defaultFriendGroupId?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export interface Contribution {
  id: string;
  title: string;
  date: Timestamp;
  payerFriendId: string;
  participantIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdByUserId?: string;
  createdByNameSnapshot?: string;
}
export type FolderRole = "owner" | "editor" | "viewer";
export interface PublicProfile {
  uid: string;
  displayName: string;
  photoURL?: string | null;
}
export interface DirectoryEntry extends PublicProfile {
  normalizedEmail: string;
}
export interface SharedFolder extends Folder {
  ownerId: string;
  ownerNameSnapshot: string;
  sourceFolderId?: string;
}
export interface FolderMembership {
  id: string;
  userId: string;
  role: FolderRole;
  displayNameSnapshot: string;
  joinedAt: Timestamp;
}
export interface SharedPerson { id:string; friendId:string; linkedUserId?:string|null; displayNameSnapshot:string; photoURLSnapshot?:string|null }
export interface ProposedFolderPerson { sourceFriendId:string; linkedUserId?:string|null; displayNameSnapshot:string; photoURLSnapshot?:string|null }
export interface FolderPersonRequest { id:string; folderId:string; proposerUid:string; proposerNameSnapshot:string; people:ProposedFolderPerson[]; status:"pending"|"approved"|"rejected"; createdAt:Timestamp; respondedAt?:Timestamp|null; respondedBy?:string|null }
export interface FolderInvitation {
  id: string;
  folderId: string;
  folderNameSnapshot: string;
  ownerId: string;
  ownerNameSnapshot: string;
  recipientUid: string;
  recipientEmail: string;
  recipientNameSnapshot: string;
  role: Exclude<FolderRole, "owner">;
  status: "pending" | "accepted" | "declined" | "cancelled";
  createdAt: Timestamp;
  respondedAt?: Timestamp | null;
}
export interface Expense {
  id: string;
  title: string;
  amount: number;
  payerFriendId?: string;
  participantIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export interface ContributionWithExpenses extends Contribution {
  expenses: Expense[];
}
export interface ExpenseDraft {
  id: string;
  title: string;
  amount: string;
  payerFriendId: string;
  participantIds: string[];
}
export interface ContributionInput {
  title: string;
  date: Date;
  payerFriendId: string;
  participantIds: string[];
  expenses: Array<{
    title: string;
    amount: number;
    payerFriendId: string;
    participantIds: string[];
  }>;
}
export interface SettlementDirection {
  fromFriendId: string;
  toFriendId: string;
  amount: number;
}
export interface ContributionObligation extends SettlementDirection {
  contributionId: string;
  contributionTitle: string;
  contributionDate: Timestamp;
  grossAmount: number;
  settledAmount: number;
}
export interface FolderFinancials {
  folder: Folder;
  contributions: ContributionWithExpenses[];
  settlements: Settlement[];
}
export interface Settlement {
  id: string;
  folderId: string;
  contributionId?: string | null;
  fromFriendId: string;
  toFriendId: string;
  amount: number;
  date: Timestamp;
  note?: string;
  source?: "individual" | "all";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export interface ActivityEntry {
  id: string;
  action: string;
  description: string;
  entityType: string;
  entityId?: string;
  folderId?: string;
  createdAt: Timestamp;
}
export type CreateFriendInput = Pick<Friend, "name">;
export type FriendGroupInput = Pick<FriendGroup, "name" | "friendIds">;
export type FolderInput = Pick<
  Folder,
  "name" | "icon" | "defaultFriendGroupId"
>;
