import type { Timestamp } from "firebase/firestore";
export const friendLabel = (friend: { name: string; isMe: boolean }) => friend.isMe ? `Me (${friend.name})` : friend.name;
export const formatDate = (date: Date | Timestamp) => (date instanceof Date ? date : date.toDate()).toLocaleDateString(undefined, { dateStyle: "medium" });
export const localDateInputValue = (date = new Date()) => { const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10); };
export const cleanName = (value: string) => value.trim().replace(/\s+/g, " ");
