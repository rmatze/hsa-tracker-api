// routes/upload.js
import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { bucket } from "../utils/firebase.js";

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });
const firebaseStorage = bucket;

// Protected upload route
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
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
      // Make file publicly accessible (or use signed URLs)
      await fileUpload.makePublic();
      const publicUrl = `https://storage.googleapis.com/${firebaseStorage.name}/${fileName}`;
      res.status(200).json({ imageUrl: publicUrl });
    });

    stream.end(file.buffer);
  } catch (error) {
    console.error("Unexpected error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;