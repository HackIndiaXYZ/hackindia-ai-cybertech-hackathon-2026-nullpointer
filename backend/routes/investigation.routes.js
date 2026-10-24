
import express from "express";
import Investigation from "../models/Investigation.js";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { extractIndicators } from "../utils/extractIndicators.js";
import Tesseract from "tesseract.js";
import sharp from "sharp";
import jsQR from "jsqr";

const router = express.Router();

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const uploadDir = path.resolve(currentDir, "../uploads");

fsSync.mkdirSync(uploadDir, { recursive: true });

const allowedTypes = {
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".txt": ["text/plain"],
  ".mp3": ["audio/mpeg", "audio/mp3"],
  ".wav": ["audio/wav", "audio/x-wav", "audio/wave"],
  ".ogg": ["audio/ogg", "application/ogg"],
  ".webm": ["audio/webm", "video/webm"],
  ".m4a": ["audio/mp4", "audio/x-m4a"],
};

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, uploadDir);
  },
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const allowedMimes = allowedTypes[extension];

    if (!allowedMimes || !allowedMimes.includes(file.mimetype)) {
      return callback(
        new Error(
          "Unsupported file type. Upload JPG, PNG, WEBP, TXT or supported audio files."
        )
      );
    }

    callback(null, true);
  },
});

function handleUpload(req, res, next) {
  upload.single("evidence")(req, res, (error) => {
    if (error) {
      const message =
        error instanceof multer.MulterError &&
        error.code === "LIMIT_FILE_SIZE"
          ? "File exceeds the 10 MB limit."
          : error.message || "File upload failed.";

      return res.status(400).json({
        success: false,
        message,
      });
    }

    next();
  });
}

// GET all investigations
router.get("/", async (req, res) => {
  try {
    const investigations = await Investigation.find().sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      count: investigations.length,
      investigations,
    });
  } catch (error) {
    console.error("Fetch investigations error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch investigations",
    });
  }
});

// GET one investigation
router.get("/:id", async (req, res) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid investigation ID",
      });
    }

    const investigation = await Investigation.findById(req.params.id);

    if (!investigation) {
      return res.status(404).json({
        success: false,
        message: "Investigation not found",
      });
    }

    res.json({
      success: true,
      investigation,
    });
  } catch (error) {
    console.error("Fetch investigation error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch investigation",
    });
  }
});

// CREATE investigation
router.post("/", async (req, res) => {
  try {
    const { incidentName, riskLevel, description } = req.body;

    if (typeof incidentName !== "string" || !incidentName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Incident name is required",
      });
    }

    const investigation = await Investigation.create({
      incidentName: incidentName.trim(),
      riskLevel,
      description,
    });

    res.status(201).json({
      success: true,
      investigation,
    });
  } catch (error) {
    console.error("Create investigation error:", error.message);

    res.status(400).json({
      success: false,
      message: "Failed to create investigation",
    });
  }
});

// UPLOAD evidence
router.post(
  "/:id/evidence",
  (req, res, next) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid investigation ID",
      });
    }

    next();
  },
  handleUpload,
  async (req, res) => {
    let savedFilePath;

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file received. Use field name "evidence".',
        });
      }

      savedFilePath = req.file.path;

      const investigation = await Investigation.findById(req.params.id);

      if (!investigation) {
        await fs.unlink(savedFilePath).catch(() => {});
        savedFilePath = null;

        return res.status(404).json({
          success: false,
          message: "Investigation not found",
        });
      }

      investigation.evidence.push({
        fileName: path.basename(req.file.originalname),
        fileType: req.file.mimetype,
        storageName: req.file.filename,
        fileSize: req.file.size,
        uploadedAt: new Date(),
        extractedText: "",
        indicators: [],
      });

      await investigation.save();

      const savedEvidence =
        investigation.evidence[investigation.evidence.length - 1];

      res.status(201).json({
        success: true,
        message: "Evidence uploaded successfully.",
        evidence: savedEvidence,
        investigationId: investigation._id,
      });
    } catch (error) {
      if (savedFilePath) {
        await fs.unlink(savedFilePath).catch(() => {});
      }

      console.error("Evidence upload error:", error.message);

      res.status(500).json({
        success: false,
        message: "Evidence upload failed.",
      });
    }
  }
);

// DELETE one evidence record and its stored file
router.delete("/:id/evidence/:evidenceId", async (req, res) => {
  try {
    const { id, evidenceId } = req.params;

    if (
      !/^[a-f\d]{24}$/i.test(id) ||
      !/^[a-f\d]{24}$/i.test(evidenceId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid investigation or evidence ID.",
      });
    }

    const investigation = await Investigation.findById(id);

    if (!investigation) {
      return res.status(404).json({
        success: false,
        message: "Investigation not found.",
      });
    }

    const evidence = investigation.evidence.id(evidenceId);

    if (!evidence) {
      return res.status(404).json({
        success: false,
        message: "Evidence not found.",
      });
    }

    const storageName = evidence.storageName;
    let filePath = null;

    if (storageName) {
      // Only allow a generated filename, never a path.
      if (path.basename(storageName) !== storageName) {
        return res.status(400).json({
          success: false,
          message: "Invalid evidence storage reference.",
        });
      }

      filePath = path.resolve(uploadDir, storageName);

      if (path.dirname(filePath) !== uploadDir) {
        return res.status(400).json({
          success: false,
          message: "Invalid evidence file path.",
        });
      }
    }

    // Remove only the selected evidence subdocument.
    investigation.evidence.pull({ _id: evidenceId });
    await investigation.save();

    let warning = null;

    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error("Stored file cleanup error:", error.message);
          warning =
            "Database record deleted, but the stored file could not be removed.";
        }
      }
    }

    res.json({
      success: true,
      message: "Evidence deleted successfully.",
      evidenceId,
      ...(warning ? { warning } : {}),
    });
  } catch (error) {
    console.error("Delete evidence error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to delete evidence.",
    });
  }
});


/* Analyze TXT, image OCR, and QR-code evidence */
router.post("/:id/evidence/:evidenceId/analyze", async (req, res) => {
  try {
    const { id, evidenceId } = req.params;

    if (
      !/^[a-f\d]{24}$/i.test(id) ||
      !/^[a-f\d]{24}$/i.test(evidenceId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid investigation or evidence ID.",
      });
    }

    const investigation = await Investigation.findById(id);

    if (!investigation) {
      return res.status(404).json({
        success: false,
        message: "Investigation not found.",
      });
    }

    const evidence = investigation.evidence.id(evidenceId);

    if (!evidence) {
      return res.status(404).json({
        success: false,
        message: "Evidence not found.",
      });
    }

    if (!evidence.storageName) {
      return res.status(400).json({
        success: false,
        message: "Stored file reference is missing. Upload again.",
      });
    }

    const storageName = path.basename(evidence.storageName);

    if (storageName !== evidence.storageName) {
      return res.status(400).json({
        success: false,
        message: "Invalid evidence storage reference.",
      });
    }

    const filePath = path.resolve(uploadDir, storageName);

    if (path.dirname(filePath) !== uploadDir) {
      return res.status(400).json({
        success: false,
        message: "Invalid evidence file path.",
      });
    }

    const extension = path.extname(evidence.fileName).toLowerCase();

    let extractedText = "";
    let qrContent = null;
    let analysisType = "";

    // 1. Plain text evidence
    if (extension === ".txt") {
      extractedText = await fs.readFile(filePath, "utf8");
      analysisType = "text";
    }

    // 2. Image evidence: OCR + QR extraction
    else if ([".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
      analysisType = "image-ocr-and-qr";

      // Read text visible in the image using OCR.
      const worker = await Tesseract.createWorker("eng");

      try {
        const ocrResult = await worker.recognize(filePath);
        extractedText = ocrResult.data.text || "";
      } finally {
        await worker.terminate();
      }

      // Decode a QR code if one exists in the image.
      try {
        const { data, info } = await sharp(filePath)
          .rotate()
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const pixels = new Uint8ClampedArray(data);

        const decoded = jsQR(pixels, info.width, info.height, {
          inversionAttempts: "attemptBoth",
        });

        if (decoded?.data) {
          qrContent = decoded.data;

          // Feed the decoded content into indicator extraction too.
          extractedText += `\n${qrContent}`;
        }
      } catch (qrError) {
        console.error("QR decoding issue:", qrError.message);
        // OCR results can still be used if QR decoding fails.
      }
    } else {
      return res.status(415).json({
        success: false,
        message: "Analysis currently supports TXT, JPG, JPEG, PNG and WEBP files.",
      });
    }

    // 3. Extract URLs, IP addresses and emails from extracted text.
    const result = extractIndicators(extractedText);

    evidence.extractedText = extractedText;
    evidence.indicators = result.indicators;

    await investigation.save();

    return res.json({
      success: true,
      message: "Evidence analysis completed.",
      evidenceId: evidence._id,
      fileName: evidence.fileName,
      analysisType,
      extractedText,
      qrDetected: Boolean(qrContent),
      qrContent,
      indicators: result.indicators,
      note:
        "Extracted text, QR contents and indicators are not proof of malicious activity. Verify suspicious URLs using trusted security sources.",
    });
  } catch (error) {
    console.error("Evidence analysis error:", error);

    if (error.code === "ENOENT") {
      return res.status(404).json({
        success: false,
        message: "Stored evidence file was not found on this server.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to analyze evidence.",
      error: error.message,
    });
  }
});
export default router;