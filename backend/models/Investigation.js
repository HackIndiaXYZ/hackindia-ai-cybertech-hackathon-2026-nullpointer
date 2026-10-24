
import mongoose from "mongoose";

const evidenceSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      default: "unknown",
    },
    storageName: {
      type: String,
      default: "",
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    extractedText: {
      type: String,
      default: "",
    },
    indicators: {
      type: [String],
      default: [],
    },
  },
  { _id: true }
);

const investigationSchema = new mongoose.Schema(
  {
    incidentName: {
      type: String,
      required: true,
      trim: true,
    },
    riskLevel: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical", "Unknown"],
      default: "Unknown",
    },
    status: {
      type: String,
      enum: ["Open", "Investigating", "Resolved"],
      default: "Open",
    },
    description: {
      type: String,
      default: "",
    },
    evidence: {
      type: [evidenceSchema],
      default: [],
    },
    attackNodes: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    timeline: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model("Investigation", investigationSchema);
