import admin from "firebase-admin";
import readline from "readline";

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// -------------------- Recursive collection deletion --------------------
async function deleteCollectionRecursively(collectionPath: string) {
  const collectionRef = db.collection(collectionPath);
  const docs = await collectionRef.listDocuments();

  for (const doc of docs) {
    // Delete subcollections recursively
    const subcollections = await doc.listCollections();
    for (const sub of subcollections) {
      await deleteCollectionRecursively(`${collectionPath}/${doc.id}/${sub.id}`);
    }
    // Delete the document
    await doc.delete();
  }

  console.log(`Deleted collection and all subcollections: ${collectionPath}`);
}

// -------------------- Collections preview --------------------
async function previewCollections() {
  const collections = await db.listCollections();
  const collectionIds = collections.map(c => c.id);

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const hexPattern = /^[0-9a-f]{32,}$/i;

  const legitimate = new Set([
    "users",
    "user-data",
    "posts",
    "comments",
    "settings"
  ]);

  const toDelete: string[] = [];
  const toKeep: string[] = [];

  for (const col of collectionIds) {
    const looksSpam = (uuidPattern.test(col) || hexPattern.test(col));
    const isLegit = legitimate.has(col);

    if (looksSpam && !isLegit) {
      toDelete.push(col);
    } else {
      toKeep.push(col);
    }
  }

  console.log("\n🗑️ Collections that would be deleted:");
  if (toDelete.length === 0) console.log("  (none)");
  toDelete.forEach(c => console.log("  -", c));

  console.log("\n🟩 Collections that would be kept:");
  if (toKeep.length === 0) console.log("  (none)");
  toKeep.forEach(c => console.log("  +", c));

  console.log(`\nSummary: Total: ${collectionIds.length}, Delete: ${toDelete.length}, Keep: ${toKeep.length}`);

  if (toDelete.length > 0) {
    rl.question("\nDo you want to DELETE the collections above? (yes/no): ", async (answer) => {
      if (answer.toLowerCase() === "yes") {
        for (const col of toDelete) {
          await deleteCollectionRecursively(col);
        }
        console.log("\n✅ All flagged collections deleted.");
      } else {
        console.log("\n❌ No collections were deleted.");
      }

      await previewUsers(); // Move to users step
    });
  } else {
    await previewUsers();
  }
}

// -------------------- Users preview --------------------
async function previewUsers() {
  const usersResult = await admin.auth().listUsers();
  const users = usersResult.users;

  const spamEmailPattern = /^hacker\d+@hackme\.com$/i;

  const usersToDelete: admin.auth.UserRecord[] = [];
  const usersToKeep: admin.auth.UserRecord[] = [];

  for (const user of users) {
    if (spamEmailPattern.test(user.email || "")) {
      usersToDelete.push(user);
    } else {
      usersToKeep.push(user);
    }
  }

  console.log("\n🗑️ Users that would be deleted:");
  if (usersToDelete.length === 0) console.log("  (none)");
  usersToDelete.forEach(u => console.log(`  - ${u.email} (${u.uid})`));

  console.log("\n🟩 Users that would be kept:");
  if (usersToKeep.length === 0) console.log("  (none)");
  usersToKeep.forEach(u => console.log(`  + ${u.email} (${u.uid})`));

  console.log(`\nSummary: Total users: ${users.length}, Delete: ${usersToDelete.length}, Keep: ${usersToKeep.length}`);

  if (usersToDelete.length > 0) {
    rl.question("\nDo you want to DELETE the users above? (yes/no): ", async (answer) => {
      if (answer.toLowerCase() === "yes") {
        for (const user of usersToDelete) {
          await admin.auth().deleteUser(user.uid);
          console.log(`Deleted user: ${user.email} (${user.uid})`);
        }
        console.log("\n✅ All flagged users deleted.");
      } else {
        console.log("\n❌ No users were deleted.");
      }

      await previewPosts(); // Move to posts step
    });
  } else {
    await previewPosts();
  }
}

// -------------------- Posts preview --------------------
async function previewPosts() {
  const postsSnapshot = await db.collection("posts").get();

  const postsToDelete: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  const postsToKeep: FirebaseFirestore.QueryDocumentSnapshot[] = [];

  const cutoffDate = new Date("2026-01-20T00:00:00Z");

  postsSnapshot.forEach(post => {
    const data = post.data();
    let timestamp: Date | null = null;

    // Properly handle Firestore Timestamp field
    if (data.timestamp instanceof admin.firestore.Timestamp) {
      timestamp = data.timestamp.toDate();
    } else if (data.timestamp) {
      const parsed = new Date(data.timestamp);
      if (!isNaN(parsed.getTime())) timestamp = parsed;
    }

    if (timestamp && timestamp >= cutoffDate) {
      postsToDelete.push(post);
    } else {
      postsToKeep.push(post);
    }
  });

  console.log("\n🗑️ Posts that would be deleted:");
  if (postsToDelete.length === 0) console.log("  (none)");
  postsToDelete.forEach(p => {
    const data = p.data();
    const timestamp = data.timestamp instanceof admin.firestore.Timestamp
      ? data.timestamp.toDate()
      : new Date(data.timestamp);

    console.log(`  - ${p.id} (userId: ${data.userId}, timestamp: ${timestamp.toISOString()})`);
  });

  console.log("\n🟩 Posts that would be kept:");
  if (postsToKeep.length === 0) console.log("  (none)");
  postsToKeep.forEach(p => {
    const data = p.data();
    const timestamp = data.timestamp instanceof admin.firestore.Timestamp
      ? data.timestamp.toDate()
      : new Date(data.timestamp);

    console.log(`  + ${p.id} (userId: ${data.userId}, timestamp: ${timestamp.toISOString()})`);
  });

  console.log(`\nSummary: Total posts: ${postsSnapshot.size}, Delete: ${postsToDelete.length}, Keep: ${postsToKeep.length}`);

  if (postsToDelete.length > 0) {
    rl.question("\nDo you want to DELETE the posts above? (yes/no): ", async (answer) => {
      if (answer.toLowerCase() === "yes") {
        for (const post of postsToDelete) {
          await post.ref.delete();
          console.log(`Deleted post: ${post.id}`);
        }
        console.log("\n✅ All flagged posts deleted.");
      } else {
        console.log("\n❌ No posts were deleted.");
      }
      rl.close();
    });
  } else {
    rl.close();
  }
}

// -------------------- Start --------------------
previewCollections().catch(console.error);
