# ForVasu Firestore Security Specification

## 1. Data Invariants
1. **PII Isolation**: Email addresses reside strictly in `/users/{userId}` and are readable/writable only by `userId`. `/publicUsers/{userId}` never contains PII.
2. **Unique Username Claim**: Creating `/publicUsers/{userId}` requires atomically claiming `/usernames/{usernameLower}` owned by `request.auth.uid`.
3. **Friend-Gated Messaging**: A `/rooms/{roomId}` DM document can only be created when a valid `/friendRequests/{roomId}` addressed to `request.auth.uid` transitions atomically from `pending` to `accepted`.
4. **Blocking Enforcement**: A user cannot create a friend request if either user has blocked the other in `/users/{uid}/blocks/{otherUid}`.
5. **Room Membership Gate**: Messages and snaps in `/rooms/{roomId}` require the sender to be a current member (`userA` or `userB`) of `/rooms/{roomId}`, with `senderId == request.auth.uid`.
6. **Atomic View-Once Burn**: Marking a message `viewOnceConsumed: true` is permitted only by the recipient and requires `/rooms/{roomId}/snaps/{messageId}` to not exist after the batch completes.
7. **Tiered Updates & Immutable Ownership**: `createdAt`, `senderId`, `userA`, `userB`, `roomId`, and `id` cannot change after creation; reactions and read/typing cursors are strictly partitioned by user slot (`userA` vs `userB`).
8. **Strict Temporal Integrity**: All `createdAt` and `updatedAt` timestamp fields must equal `request.time`.
9. **Dual Auth Integrity**: Users authenticate either via verified Google OAuth (`email_verified == true`) or via Username & Password (`sign_in_provider == 'password'` with synthetic `<usernameLower>@users.forvasu.app`), where synthetic accounts are bound strictly to claiming their matching `/usernames/{usernameLower}`.
10. **Stories Visibility & Expiry**: `/stories/{storyId}` can only be read/listed by UIDs in `viewerIds` (bounded `<= 500`, anchored by `authorId == request.auth.uid`) and deleted only by `authorId` or after `expiresAtMs`.
11. **Call Signaling Isolation & Terminal Locking**: `/calls/{callId}` requires an existing DM `/rooms/{roomId}` between `callerId` and `calleeId`, allows reads/ICE candidates strictly to `participantIds`, and locks terminal call statuses (`ended`, `declined`, `missed`) from further updates.
12. **Group Membership Gate & Per-User Reactions**: `/groups/{groupId}` and its `/messages/{messageId}` restrict access to `memberIds` (`<= 30`), and reaction updates may mutate only `reactionsByUser[request.auth.uid]`.
13. **Owner-Only Preferences & Bookmarks**: `/users/{userId}/chatPrefs/{roomId}` and `/users/{userId}/savedMessages/{messageId}` are strictly restricted to `isOwner(userId)`.

## 2. "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Identity Spoofing on Public Profile**: Authenticated user `alice` tries to create `/publicUsers/bob` with `id: "bob"`.
2. **PII Leak Read**: Authenticated user `alice` tries `get(/users/bob)` to read Bob's email.
3. **Shadow Ghost Field**: User `alice` tries to create `/publicUsers/alice` with an extra field `isAdmin: true` or `role: "admin"`.
4. **Username Collision Hijack**: User `alice` tries to overwrite `/usernames/bob` (`uid: "bob"`) with `uid: "alice"`.
5. **Unverified Timestamp Forgery**: User `alice` creates `/publicUsers/alice` with a backdated `createdAt` instead of `request.time`.
6. **Blocked User Request Bypass**: User `alice` tries to create `/friendRequests/alice__bob` while `/users/bob/blocks/alice` exists.
7. **Self-Accept Friend Request**: Sender `alice` tries to update her own pending request `/friendRequests/alice__bob` to `status: "accepted"`.
8. **Room Creation Without Request**: User `alice` tries to create `/rooms/alice__bob` without an accepted `/friendRequests/alice__bob`.
9. **Blanket List Scraping**: User `alice` queries `/friendRequests` or `/rooms/{roomId}/messages` without constraining to her own UID.
10. **Cross-User Reaction Tampering**: `userA` updates `reactionsB` on a message in `/rooms/{roomId}/messages/{messageId}`.
11. **View-Once Unburned Flag Flip**: Recipient updates `viewOnceConsumed: true` on `/rooms/{roomId}/messages/{messageId}` without deleting `/rooms/{roomId}/snaps/{messageId}`.
12. **Resource Poisoning / Oversized Payload**: User `alice` sends a `content` string > 2000 characters or `bio` > 160 characters or an invalid `roomId` > 260 characters.
