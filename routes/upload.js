// routes/upload.js
import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { bucket } from "../utils/firebase.js";
import { pool } from "../utils/db.js";

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });
const firebaseStorage = bucket;

// POST /api/upload - upload a single file and attach it to an expense
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { expenseId } = req.body;

    if (!expenseId) {
      return res.status(400).json({ message: "Missing expenseId in request body" });
    }

    const file = req.file;
    const fileName = `${req.user}/${uuidv4()}.jpg`;
    const fileUpload = firebaseStorage.file(fileName);

    const stream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
      },
    });

    stream.on("error", (err) => {
      console.error("Upload error:", err);
      return res.status(500).json({ message: "Upload failed" });
    });

    stream.on("finish", async () => {
      await fileUpload.makePublic();
      const publicUrl = `https://storage.googleapis.com/${firebaseStorage.name}/${fileName}`;

      // Insert a new expense image record
      const imageId = uuidv4();
      await pool.query(
        `
          INSERT INTO expense_images (id, expense_id, user_id, image_url, mime_type)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [imageId, expenseId, req.user, publicUrl, file.mimetype]
      );

      res.status(200).json({
        imageId,
        imageUrl: publicUrl,
        mimeType: file.mimetype,
      });
    });

    stream.end(file.buffer);
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;