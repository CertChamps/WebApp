import os
import re
import json
import firebase_admin
from firebase_admin import credentials, storage, firestore

# CONFIG
FIREBASE_CRED = "firebase-credentials.json"
BUCKET_NAME = "certchamps-a7527.firebasestorage.app"  # using your original
IMAGE_DIR = "./images"
JSON_FILE = "questions.json"
COLLECTION_NAME = "certchamps-questions"

# allowable suffix letters for multipart questions
PART_LETTERS = "abcdefghijklmnopqrstuvwxyz"

# Init Firebase
if not firebase_admin._apps:
    cred = credentials.Certificate(FIREBASE_CRED)
    firebase_admin.initialize_app(cred, {"storageBucket": BUCKET_NAME})

db = firestore.client()
bucket = storage.bucket()

# Load Questions
with open(JSON_FILE, "r", encoding="utf-8") as f:
    question_sets = json.load(f)

# Utility: sanitize folder/tag names for Firebase Storage
def sanitize_folder_name(name: str) -> str:
    """
    Removes all spaces and special characters — keeps only letters and digits.
    Example: "Area & Volume " -> "AreaVolume"
    """
    # Remove everything except letters and numbers
    return re.sub(r"[^a-zA-Z0-9]", "", name)

for q_set in question_sets:
    qid = q_set["id"]
    name = q_set.get("name")
    tags = q_set.get("tags", [])
    difficulty = q_set.get("difficulty")
    is_exam_q = q_set.get("isExamQ", False)
    marking_scheme = q_set.get("markingScheme")  # string
    log_tables = q_set.get("logTables")          # string

    # Create/overwrite the top-level document for this question set
    doc_ref = db.collection(COLLECTION_NAME).document(qid)
    doc_ref.set(
        {
            "id": qid,
            "name": name,
            "tags": tags,
            "difficulty": difficulty,
            "isExamQ": is_exam_q,
            "markingScheme": marking_scheme,
            "logTables": log_tables,
        }
    )

    # Create a subcollection 'content' for the individual questions
    content_ref = doc_ref.collection("content")

    # Build storage folder path from tags (safe join)
    folder_path = sanitize_folder_name(tags[0]) if tags else qid

    # Get questions and related arrays
    questions = q_set.get("questions", [])
    answers = q_set.get("answers", [])
    ordermatters = q_set.get("orderMatters", [])
    prefix = q_set.get("prefix", [])

    if not isinstance(questions, list):
        questions = [str(questions)]

    if len(questions) > len(PART_LETTERS):
        raise ValueError(
            f"Question set {qid} has {len(questions)} parts which exceeds the "
            f"supported maximum of {len(PART_LETTERS)} parts."
        )

    for idx, question_text in enumerate(questions):
        suffix = "" if len(questions) == 1 else PART_LETTERS[idx]

        image_filename = f"{qid}{suffix}.png"
        image_local_path = os.path.join(IMAGE_DIR, image_filename)
        image_storage_path = None

        # Upload source image (if exists)
        if os.path.exists(image_local_path):
            try:
                image_storage_path = f"images/{folder_path}/{image_filename}"
                blob_image = bucket.blob(image_storage_path)
                blob_image.upload_from_filename(image_local_path)
                print(f"✅ Uploaded source image for {qid}{suffix} -> {image_storage_path}")
            except Exception as e:
                print(f"⚠️ Failed to upload source image {image_local_path}: {e}")
        else:
            print(f"ℹ️ No source image found at {image_local_path} (will store null)")

        question_doc_id = f"q{idx+1}"

        answer_value = answers[idx] if idx < len(answers) else None
        ordermatters_flag = ordermatters[idx] if idx < len(ordermatters) else None
        prefix_value = prefix[idx] if idx < len(prefix) else None

        try:
            content_doc = content_ref.document(question_doc_id)
            content_doc.set(
                {
                    "question": question_text,
                    "answer": answer_value,
                    "ordermatters": ordermatters_flag,
                    "prefix": prefix_value,
                    "image": image_storage_path,
                    "markingScheme": marking_scheme,
                    "logTables": log_tables,
                }
            )
            print(f"✅ Uploaded question {question_doc_id} for set {qid}{suffix}")
        except Exception as e:
            print(f"⚠️ Failed to write question {question_doc_id} for {qid}{suffix}: {e}")

    print(f"✅ Finished uploading question set {qid}")
