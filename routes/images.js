// routes/images.js
import express from "express";
import { pool } from "../utils/db.js";
import { bucket } from "../utils/firebase.js";

const router = express.Router();

// GET /api/images/:expenseId - list images for a specific expense
router.get("/:expenseId", async (req, res) => {
  const userId = req.user;
  const { expenseId } = req.params;

  try {
    const { rows } = await pool.query(
      `
        SELECT id, image_url, mime_type, created_at
        FROM expense_images
        WHERE expense_id = $1
          AND user_id = $2
        ORDER BY created_at ASC
      `,
      [expenseId, userId]
    );

    res.json(rows);
  } catch (error) {
    console.error("Failed to fetch expense images:", error);
    res.status(500).json({ message: "Failed to fetch expense images" });
  }
});

// DELETE /api/images/:id - delete a specific image
router.delete("/:id", async (req, res) => {
  const imageId = req.params.id;
  const userId = req.user;

  try {
    // 1. Look up the image record
    const result = await pool.query(
      `SELECT image_url FROM expense_images WHERE id = $1 AND user_id = $2`,
      [imageId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Image not found or not authorized" });
    }

    const imageUrl = result.rows[0].image_url;

    // 2. Extract the path after the bucket name
    const match = imageUrl.match(/\/([^\/]+\/[^\/]+\.[a-z]+)$/);
    if (!match) {
      return res.status(400).json({ message: "Invalid image URL format" });
    }

    const filePath = match[1]; // e.g. MpNaWE7P8aW2zOJcdTwYBGFQRH92/1234.jpg
    const file = bucket.file(filePath);

    // 3. Delete from Firebase
    await file.delete();

    // 4. Delete from database
    await pool.query(`DELETE FROM expense_images WHERE id = $1 AND user_id = $2`, [
      imageId,
      userId,
    ]);

    res.status(200).json({ message: "Image deleted successfully" });
  } catch (error) {
    console.error("Error deleting image:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;