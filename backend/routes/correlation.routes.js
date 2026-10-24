
import express from "express";
import mongoose from "mongoose";
import Investigation from "../models/Investigation.js";

const router = express.Router();

function normalizeIndicator(indicator) {
  return String(indicator).trim().toLowerCase();
}

// POST /api/correlations/:investigationId
router.post("/:investigationId", async (req, res) => {
  try {
    const { investigationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(investigationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid investigation ID.",
      });
    }

    const investigation = await Investigation.findById(investigationId);

    if (!investigation) {
      return res.status(404).json({
        success: false,
        message: "Investigation not found.",
      });
    }

    const evidence = investigation.evidence || [];
    const nodes = [];
    const edges = [];
    const indicatorMap = new Map();

    // Create one node for every evidence file.
    evidence.forEach((file) => {
      nodes.push({
        id: `evidence-${file._id}`,
        type: "evidence",
        label: file.fileName,
        evidenceId: String(file._id),
      });

      // Group identical indicators found in different files.
      (file.indicators || []).forEach((rawIndicator) => {
        const value = String(rawIndicator).trim();
        if (!value) return;

        const key = normalizeIndicator(value);

        if (!indicatorMap.has(key)) {
          indicatorMap.set(key, {
            value,
            evidenceIds: new Set(),
            evidenceNames: new Set(),
          });
        }

        const match = indicatorMap.get(key);
        match.evidenceIds.add(String(file._id));
        match.evidenceNames.add(file.fileName);
      });
    });

    const matches = [];

    for (const [key, item] of indicatorMap.entries()) {
      // Only call it a shared match when at least two files contain it.
      if (item.evidenceIds.size < 2) continue;

      const indicatorNodeId = `indicator-${nodes.length}-${matches.length}`;

      nodes.push({
        id: indicatorNodeId,
        type: "shared-indicator",
        label: item.value,
        evidenceCount: item.evidenceIds.size,
      });

      for (const evidenceId of item.evidenceIds) {
        edges.push({
          source: `evidence-${evidenceId}`,
          target: indicatorNodeId,
          relationship: "contains the same indicator",
        });
      }

      matches.push({
        indicator: item.value,
        evidenceCount: item.evidenceIds.size,
        evidenceNames: [...item.evidenceNames],
        evidenceIds: [...item.evidenceIds],
        explanation:
          `The same indicator appears in ${item.evidenceIds.size} evidence files.`,
      });
    }

    const result = {
      generatedAt: new Date().toISOString(),
      summary: {
        evidenceFiles: evidence.length,
        indicatorsChecked: [...indicatorMap.values()].length,
        sharedIndicators: matches.length,
        connections: edges.length,
      },
      nodes,
      edges,
      matches,
      note:
        "A shared indicator shows a data match only. It does not prove who sent the files or that a cyberattack occurred.",
    };

    // Save the generated graph in MongoDB.
    investigation.attackNodes = nodes;
    const existingEvents = (investigation.timeline || []).filter(
  (event) =>
    !["correlation-generated", "evidence-uploaded"].includes(
      event?.eventType
    )
);

const evidenceEvents = evidence.map((file) => ({
  eventType: "evidence-uploaded",
  title: `Evidence added: ${file.fileName}`,
  description: `${file.fileName} is included in this investigation.`,
  timestamp: file.uploadedAt || new Date(),
}));

investigation.timeline = [
  ...existingEvents,
  ...evidenceEvents,
  {
    eventType: "correlation-generated",
    title: "Evidence correlation completed",
    description: `${matches.length} shared indicator(s) found across ${evidence.length} evidence files.`,
    timestamp: new Date(),
  },
];

    await investigation.save();

    return res.json({
      success: true,
      message: "Evidence correlation completed.",
      investigationId: String(investigation._id),
      result,
    });
  } catch (error) {
    console.error("Correlation error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not correlate the evidence.",
    });
  }
});

export default router;
