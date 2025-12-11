## HSA Tracker API – Route Usage Guide

All API routes (except `/`) are protected by Firebase Auth via the `Authorization: Bearer <ID_TOKEN>` header.

Base URL (local): `http://localhost:4000`

---

## Expenses

### GET `/api/expenses`

**Description:** List expenses for the logged-in user.

**Query params:**
- `status` (optional): `active` (default) | `archived` | `all`
- `categoryId` (optional): UUID of an `expense_categories` record
- `reimbursed` (optional): `"true"` or `"false"`

**Example: get active, unreimbursed expenses**

```bash
curl -X GET "http://localhost:4000/api/expenses?status=active&reimbursed=false" \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN"
```

---

### POST `/api/expenses`

**Description:** Create a new expense.

**Body (JSON):**

```json
{
  "amount": 123.45,
  "date_paid": "2025-02-20",
  "payment_method": "Credit Card",
  "description": "Dentist visit",
  "category_id": "UUID_OF_CATEGORY" // optional
}
```

**Example:**

```bash
curl -X POST "http://localhost:4000/api/expenses" \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 123.45,
    "date_paid": "2025-02-20",
    "payment_method": "Credit Card",
    "description": "Dentist visit",
    "category_id": "UUID_OF_CATEGORY"
  }'
```

---

### PUT `/api/expenses/:id`

**Description:** Update an existing expense. Omitting `category_id` leaves the existing category unchanged.

**Body (JSON):**

```json
{
  "amount": 150.00,
  "date_paid": "2025-02-21",
  "payment_method": "Credit Card",
  "description": "Updated description",
  "category_id": "UUID_OF_CATEGORY" // optional
}
```

---

### DELETE `/api/expenses/:id`

**Description:** Soft-delete (archive) an expense. It will no longer appear in `status=active` results but is retained for history.

**Example:**

```bash
curl -X DELETE "http://localhost:4000/api/expenses/EXPENSE_ID" \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN"
```

---

### PATCH `/api/expenses/:id/reimburse`

**Description:** Mark or unmark an expense as reimbursed.

**Body (JSON):**

```json
{
  "is_reimbursed": true,
  "reimbursed_at": "2025-02-21T15:30:00.000Z",   // optional; defaults to now when true
  "reimbursement_method": "Fidelity HSA",        // optional
  "reimbursement_notes": "Covered 2024 dental"   // optional
}
```

**Example: mark reimbursed**

```bash
curl -X PATCH "http://localhost:4000/api/expenses/EXPENSE_ID/reimburse" \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "is_reimbursed": true,
    "reimbursement_method": "Fidelity HSA"
  }'
```

---

## Categories

### GET `/api/categories`

**Description:** List global, active expense categories.

**Example:**

```bash
curl -X GET "http://localhost:4000/api/categories" \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN"
```

---

## Images

### GET `/api/images/:expenseId`

**Description:** List images attached to a specific expense.

**Example:**

```bash
curl -X GET "http://localhost:4000/api/images/EXPENSE_ID" \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN"
```

**Response shape:**

```json
[
  {
    "id": "IMAGE_UUID",
    "image_url": "https://storage.googleapis.com/BUCKET/user/uuid.jpg",
    "mime_type": "image/jpeg",
    "created_at": "2025-02-20T12:34:56.789Z"
  }
]
```

---

### DELETE `/api/images/:id`

**Description:** Delete a specific image (from Firebase Storage and the `expense_images` table).

**Example:**

```bash
curl -X DELETE "http://localhost:4000/api/images/IMAGE_ID" \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN"
```

---

## Uploads

### POST `/api/upload`

**Description:** Upload a single file and associate it with an expense.

**Request:**
- `Content-Type: multipart/form-data`
- Fields:
  - `file`: the image/PDF file
  - `expenseId`: UUID of the expense

**Example with `curl`:**

```bash
curl -X POST "http://localhost:4000/api/upload" \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -F "file=@/path/to/receipt.jpg" \
  -F "expenseId=EXPENSE_ID"
```

**Response:**

```json
{
  "imageId": "IMAGE_UUID",
  "imageUrl": "https://storage.googleapis.com/BUCKET/user/uuid.jpg",
  "mimeType": "image/jpeg"
}
```

---

## Root

### GET `/`

**Description:** Simple health/info endpoint.

**Example:**

```bash
curl -X GET "http://localhost:4000/"
```


